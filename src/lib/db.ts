import type { Inspection, PhotoRecord } from '../types';

const DB_NAME = 'etat-des-lieux';
const DB_VERSION = 2;

type StoreName = 'inspections' | 'photos' | 'outbox';

export type OutboxKind = 'inspection' | 'photo' | 'deleteInspection' | 'deletePhoto';

/** Operation locale en attente d'envoi vers Supabase. */
export interface OutboxEntry {
  key: string;
  kind: OutboxKind;
  targetId: string;
  inspectionId: string;
  createdAt: string;
}

/** `silent` : ecriture issue de la synchronisation, a ne pas renvoyer au serveur. */
export interface WriteOptions {
  silent?: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('inspections')) {
        db.createObjectStore('inspections', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('photos')) {
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('inspectionId', 'inspectionId');
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponible'));
  });
  return dbPromise;
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Erreur IndexedDB'));
  });
}

async function store(name: StoreName, mode: IDBTransactionMode) {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

/* ---------- File d'envoi (outbox) ---------- */

function notifyOutbox(): void {
  window.dispatchEvent(new CustomEvent('app:outbox'));
}

export async function enqueue(kind: OutboxKind, targetId: string, inspectionId: string): Promise<void> {
  const entry: OutboxEntry = { key: `${kind}:${targetId}`, kind, targetId, inspectionId, createdAt: new Date().toISOString() };
  await wrap((await store('outbox', 'readwrite')).put(entry));
  notifyOutbox();
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const all = await wrap((await store('outbox', 'readonly')).getAll() as IDBRequest<OutboxEntry[]>);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Retire une entree seulement si elle n'a pas ete re-enfilee pendant l'envoi. */
export async function removeOutbox(entry: OutboxEntry): Promise<void> {
  const outbox = await store('outbox', 'readwrite');
  const current = await wrap(outbox.get(entry.key) as IDBRequest<OutboxEntry | undefined>);
  if (current && current.createdAt === entry.createdAt) await wrap(outbox.delete(entry.key));
}

async function dropOutboxFor(inspectionId: string): Promise<void> {
  const entries = await listOutbox();
  const outbox = await store('outbox', 'readwrite');
  await Promise.all(entries.filter((e) => e.inspectionId === inspectionId).map((e) => wrap(outbox.delete(e.key))));
}

/* ---------- Etats des lieux ---------- */

export async function listInspections(): Promise<Inspection[]> {
  const all = await wrap((await store('inspections', 'readonly')).getAll() as IDBRequest<Inspection[]>);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getInspection(id: string): Promise<Inspection | undefined> {
  return wrap((await store('inspections', 'readonly')).get(id) as IDBRequest<Inspection | undefined>);
}

export async function saveInspection(inspection: Inspection, options: WriteOptions = {}): Promise<void> {
  await wrap((await store('inspections', 'readwrite')).put(inspection));
  if (!options.silent) await enqueue('inspection', inspection.id, inspection.id);
}

export async function deleteInspection(id: string, options: WriteOptions = {}): Promise<void> {
  const photos = await listPhotos(id);
  const db = await openDb();
  const tx = db.transaction(['inspections', 'photos'], 'readwrite');
  tx.objectStore('inspections').delete(id);
  photos.forEach((p) => tx.objectStore('photos').delete(p.id));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Suppression impossible'));
  });
  await dropOutboxFor(id);
  if (!options.silent) await enqueue('deleteInspection', id, id);
}

/* ---------- Photos ---------- */

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  return wrap((await store('photos', 'readonly')).get(id) as IDBRequest<PhotoRecord | undefined>);
}

export async function listPhotos(inspectionId: string): Promise<PhotoRecord[]> {
  const index = (await store('photos', 'readonly')).index('inspectionId');
  return wrap(index.getAll(inspectionId) as IDBRequest<PhotoRecord[]>);
}

export async function savePhoto(photo: PhotoRecord, options: WriteOptions = {}): Promise<void> {
  await wrap((await store('photos', 'readwrite')).put(photo));
  if (!options.silent) await enqueue('photo', photo.id, photo.inspectionId);
}

export async function deletePhotos(ids: string[], options: WriteOptions = {}): Promise<void> {
  if (ids.length === 0) return;
  const records = await Promise.all(ids.map(getPhoto));
  const photos = await store('photos', 'readwrite');
  await Promise.all(ids.map((id) => wrap(photos.delete(id))));
  if (options.silent) return;
  for (const record of records) {
    if (record) await enqueue('deletePhoto', record.id, record.inspectionId);
  }
}

/** Demande au navigateur de ne pas purger les donnees locales. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
