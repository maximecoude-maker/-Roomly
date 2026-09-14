import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Inspection, PhotoRecord } from '../types';
import {
  deleteInspection,
  deletePhotos,
  enqueue,
  getInspection,
  getPhoto,
  listInspections,
  listOutbox,
  listPhotos,
  removeOutbox,
  saveInspection,
  savePhoto,
  type OutboxEntry,
} from './db';
import { PHOTO_BUCKET, supabase } from './supabase';

/* Synchronisation "local d'abord" : IndexedDB reste la source de verite sur l'appareil,
   Supabase sert de sauvegarde et de lien entre appareils (dernier ecrit gagne). */

export type SyncStatus = 'off' | 'signedOut' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  email: string | null;
  pending: number;
  lastSyncAt: string | null;
  error: string | null;
}

let state: SyncState = { status: supabase ? 'signedOut' : 'off', email: null, pending: 0, lastSyncAt: null, error: null };
const listeners = new Set<() => void>();
let session: Session | null = null;
let running = false;
let rerun = false;
let timer: number | undefined;
let started = false;

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function useSync(): SyncState {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return state;
}

function client() {
  if (!supabase) throw new Error('Synchronisation non configurée');
  return supabase;
}

const photoPath = (uid: string, photo: { inspectionId: string; id: string }, thumb = false) => `${uid}/${photo.inspectionId}/${photo.id}${thumb ? '_thumb' : ''}.jpg`;

async function refreshPending(): Promise<void> {
  setState({ pending: (await listOutbox()).length });
}

/* ---------- Envoi ---------- */

async function upsertInspection(inspection: Inspection): Promise<void> {
  const { error } = await client()
    .from('inspections')
    .upsert({ id: inspection.id, type: inspection.type, status: inspection.status, data: inspection, updated_at: inspection.updatedAt, deleted_at: null });
  if (error) throw new Error(`Envoi de l'état des lieux : ${error.message}`);
}

async function uploadPhoto(uid: string, photo: PhotoRecord): Promise<void> {
  const bucket = client().storage.from(PHOTO_BUCKET);
  const full = await bucket.upload(photoPath(uid, photo), photo.blob, { upsert: true, contentType: 'image/jpeg' });
  if (full.error) throw new Error(`Envoi de la photo : ${full.error.message}`);
  const thumb = await bucket.upload(photoPath(uid, photo, true), photo.thumb, { upsert: true, contentType: 'image/jpeg' });
  if (thumb.error) throw new Error(`Envoi de la miniature : ${thumb.error.message}`);
  const { error } = await client()
    .from('photos')
    .upsert({
      id: photo.id,
      inspection_id: photo.inspectionId,
      storage_path: photoPath(uid, photo),
      thumb_path: photoPath(uid, photo, true),
      width: photo.width,
      height: photo.height,
      source: photo.source,
      name: photo.name,
      updated_at: photo.updatedAt ?? photo.createdAt,
    });
  if (error) throw new Error(`Enregistrement de la photo : ${error.message}`);
}

async function removeRemotePhoto(uid: string, entry: OutboxEntry): Promise<void> {
  const target = { id: entry.targetId, inspectionId: entry.inspectionId };
  const removed = await client().storage.from(PHOTO_BUCKET).remove([photoPath(uid, target), photoPath(uid, target, true)]);
  if (removed.error) throw new Error(`Suppression de la photo : ${removed.error.message}`);
  const { error } = await client().from('photos').delete().eq('id', entry.targetId);
  if (error) throw new Error(`Suppression de la photo : ${error.message}`);
}

async function removeRemoteInspection(entry: OutboxEntry): Promise<void> {
  const now = new Date().toISOString();
  const rows = await client().from('photos').select('storage_path, thumb_path').eq('inspection_id', entry.targetId);
  if (rows.error) throw new Error(`Suppression : ${rows.error.message}`);
  const paths = (rows.data ?? []).flatMap((r) => [r.storage_path as string, r.thumb_path as string]);
  if (paths.length > 0) {
    const removed = await client().storage.from(PHOTO_BUCKET).remove(paths);
    if (removed.error) throw new Error(`Suppression des photos : ${removed.error.message}`);
  }
  const photos = await client().from('photos').delete().eq('inspection_id', entry.targetId);
  if (photos.error) throw new Error(`Suppression des photos : ${photos.error.message}`);
  // Suppression logique : les autres appareils la recoivent au prochain rafraichissement.
  const { error } = await client().from('inspections').update({ deleted_at: now, updated_at: now }).eq('id', entry.targetId);
  if (error) throw new Error(`Suppression : ${error.message}`);
}

async function push(uid: string): Promise<void> {
  const pushed = new Set<string>();
  for (const entry of await listOutbox()) {
    if (entry.kind === 'inspection') {
      const inspection = await getInspection(entry.targetId);
      if (inspection) await upsertInspection(inspection);
      pushed.add(entry.targetId);
    } else if (entry.kind === 'photo') {
      const photo = await getPhoto(entry.targetId);
      const inspection = photo ? await getInspection(photo.inspectionId) : undefined;
      if (photo && inspection) {
        if (!pushed.has(inspection.id)) {
          await upsertInspection(inspection);
          pushed.add(inspection.id);
        }
        await uploadPhoto(uid, photo);
      }
    } else if (entry.kind === 'deletePhoto') {
      await removeRemotePhoto(uid, entry);
    } else {
      await removeRemoteInspection(entry);
    }
    await removeOutbox(entry);
    await refreshPending();
  }
}

/* ---------- Reception ---------- */

async function pullPhotos(inspectionId: string): Promise<void> {
  const { data, error } = await client().from('photos').select('*').eq('inspection_id', inspectionId);
  if (error) throw new Error(`Lecture des photos : ${error.message}`);
  const remoteIds = new Set<string>();
  const local = new Map((await listPhotos(inspectionId)).map((p) => [p.id, p]));
  const bucket = client().storage.from(PHOTO_BUCKET);
  for (const row of data ?? []) {
    remoteIds.add(row.id as string);
    const existing = local.get(row.id as string);
    const remoteTime = Date.parse(row.updated_at as string);
    if (existing && Date.parse(existing.updatedAt ?? existing.createdAt) >= remoteTime - 1000) continue;
    const [full, thumb] = await Promise.all([bucket.download(row.storage_path as string), bucket.download(row.thumb_path as string)]);
    if (full.error || !full.data) throw new Error(`Téléchargement de la photo : ${full.error?.message ?? 'vide'}`);
    const record: PhotoRecord = {
      id: row.id as string,
      inspectionId,
      blob: full.data,
      thumb: thumb.data ?? full.data,
      width: row.width as number,
      height: row.height as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      source: row.source as PhotoRecord['source'],
      name: row.name as string,
    };
    await savePhoto(record, { silent: true });
  }
  const orphans = [...local.keys()].filter((id) => !remoteIds.has(id));
  if (orphans.length > 0) await deletePhotos(orphans, { silent: true });
}

async function pull(uid: string): Promise<string[]> {
  const cursorKey = `edl-sync-cursor-${uid}`;
  const since = localStorage.getItem(cursorKey) ?? '1970-01-01T00:00:00Z';
  const { data, error } = await client().from('inspections').select('id, data, synced_at, deleted_at').gt('synced_at', since).order('synced_at');
  if (error) throw new Error(`Lecture des états des lieux : ${error.message}`);
  const pendingIds = new Set((await listOutbox()).map((e) => e.inspectionId));
  const changed: string[] = [];
  let cursor = since;
  for (const row of data ?? []) {
    cursor = row.synced_at as string;
    const id = row.id as string;
    if (pendingIds.has(id)) continue;
    const local = await getInspection(id);
    if (row.deleted_at) {
      if (local) {
        await deleteInspection(id, { silent: true });
        changed.push(id);
      }
      continue;
    }
    const remote = row.data as Inspection;
    if (!local || remote.updatedAt > local.updatedAt) {
      await pullPhotos(id);
      await saveInspection(remote, { silent: true });
      changed.push(id);
    }
  }
  localStorage.setItem(cursorKey, cursor);
  return changed;
}

/** A la premiere connexion sur un appareil, envoie tout ce qui existe deja en local. */
async function bootstrap(uid: string): Promise<void> {
  const flag = `edl-sync-bootstrapped-${uid}`;
  if (localStorage.getItem(flag)) return;
  for (const inspection of await listInspections()) {
    await enqueue('inspection', inspection.id, inspection.id);
    for (const photo of await listPhotos(inspection.id)) await enqueue('photo', photo.id, inspection.id);
  }
  localStorage.setItem(flag, new Date().toISOString());
}

/* ---------- Orchestration ---------- */

async function runSync(): Promise<void> {
  if (!supabase) return;
  if (running) {
    rerun = true;
    return;
  }
  const uid = session?.user.id;
  if (!uid) {
    setState({ status: 'signedOut' });
    return;
  }
  if (!navigator.onLine) {
    await refreshPending();
    setState({ status: 'offline' });
    return;
  }
  running = true;
  setState({ status: 'syncing', error: null });
  try {
    await bootstrap(uid);
    await push(uid);
    const changed = await pull(uid);
    if (changed.length > 0) window.dispatchEvent(new CustomEvent('app:remote-change', { detail: changed }));
    await refreshPending();
    setState({ status: 'idle', lastSyncAt: new Date().toISOString() });
  } catch (error) {
    console.error('Synchronisation interrompue', error);
    await refreshPending();
    setState({ status: navigator.onLine ? 'error' : 'offline', error: error instanceof Error ? error.message : 'Erreur inconnue' });
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      schedule(500);
    }
  }
}

function schedule(delay: number): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void runSync(), delay);
}

export function syncNow(): void {
  schedule(0);
}

export function startSync(): void {
  if (!supabase || started) return;
  started = true;
  supabase.auth.onAuthStateChange((_event, next) => {
    session = next;
    setState({ email: next?.user.email ?? null, status: next ? state.status === 'signedOut' ? 'idle' : state.status : 'signedOut' });
    if (next) schedule(0);
  });
  window.addEventListener('app:outbox', () => {
    void refreshPending();
    schedule(2000);
  });
  window.addEventListener('online', () => schedule(0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(0);
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') schedule(0);
  }, 60000);
  void refreshPending();
}

export async function signInWithEmail(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/` } });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const { error } = await client().auth.signOut();
  if (error) throw new Error(error.message);
}
