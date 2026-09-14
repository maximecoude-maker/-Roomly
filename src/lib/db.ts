import type { Inspection, PhotoRecord } from '../types';

const DB_NAME = 'etat-des-lieux';
const DB_VERSION = 1;

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

async function store(name: 'inspections' | 'photos', mode: IDBTransactionMode) {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function listInspections(): Promise<Inspection[]> {
  const all = await wrap((await store('inspections', 'readonly')).getAll() as IDBRequest<Inspection[]>);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getInspection(id: string): Promise<Inspection | undefined> {
  return wrap((await store('inspections', 'readonly')).get(id) as IDBRequest<Inspection | undefined>);
}

export async function saveInspection(inspection: Inspection): Promise<void> {
  await wrap((await store('inspections', 'readwrite')).put(inspection));
}

export async function deleteInspection(id: string): Promise<void> {
  const photos = await listPhotos(id);
  const db = await openDb();
  const tx = db.transaction(['inspections', 'photos'], 'readwrite');
  tx.objectStore('inspections').delete(id);
  photos.forEach((p) => tx.objectStore('photos').delete(p.id));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Suppression impossible'));
  });
}

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  return wrap((await store('photos', 'readonly')).get(id) as IDBRequest<PhotoRecord | undefined>);
}

export async function listPhotos(inspectionId: string): Promise<PhotoRecord[]> {
  const index = (await store('photos', 'readonly')).index('inspectionId');
  return wrap(index.getAll(inspectionId) as IDBRequest<PhotoRecord[]>);
}

export async function savePhoto(photo: PhotoRecord): Promise<void> {
  await wrap((await store('photos', 'readwrite')).put(photo));
}

export async function deletePhotos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const photos = await store('photos', 'readwrite');
  await Promise.all(ids.map((id) => wrap(photos.delete(id))));
}

/** Demande au navigateur de ne pas purger les donnees locales. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
