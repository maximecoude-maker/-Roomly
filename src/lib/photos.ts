import type { PhotoRecord } from '../types';
import { getPhoto, savePhoto } from './db';
import { uid } from './ids';

const MAX_SIDE = 2000;
const THUMB_SIDE = 480;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Format d'image non pris en charge par ce navigateur"));
    };
    img.src = url;
  });
}

function drawScaled(img: HTMLImageElement, maxSide: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas indisponible'));
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width, height }) : reject(new Error('Compression impossible'))),
      'image/jpeg',
      quality,
    );
  });
}

/** Normalise une image (JPEG, 2000 px max) et genere sa miniature. */
export async function buildPhoto(file: Blob, inspectionId: string, source: PhotoRecord['source'], name: string): Promise<PhotoRecord> {
  const img = await loadImage(file);
  const full = await drawScaled(img, MAX_SIDE, 0.86);
  const thumb = await drawScaled(img, THUMB_SIDE, 0.75);
  return {
    id: uid(),
    inspectionId,
    blob: full.blob,
    thumb: thumb.blob,
    width: full.width,
    height: full.height,
    createdAt: new Date().toISOString(),
    source,
    name,
  };
}

export async function importFiles(files: FileList | File[], inspectionId: string, source: PhotoRecord['source']): Promise<{ ids: string[]; errors: string[] }> {
  const ids: string[] = [];
  const errors: string[] = [];
  for (const file of Array.from(files)) {
    try {
      const photo = await buildPhoto(file, inspectionId, source, file.name);
      await savePhoto(photo);
      ids.push(photo.id);
    } catch (error) {
      errors.push(`${file.name} : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    }
  }
  return { ids, errors };
}

/** Remplace le contenu d'une photo en conservant son identifiant et son rattachement. */
export async function replacePhotoContent(id: string, file: File): Promise<void> {
  const existing = await getPhoto(id);
  if (!existing) throw new Error('Photo introuvable');
  const next = await buildPhoto(file, existing.inspectionId, 'import', file.name);
  await savePhoto({ ...next, id, createdAt: existing.createdAt });
  revokePhotoUrls(id);
}

export async function duplicatePhoto(id: string, inspectionId: string): Promise<string | null> {
  const existing = await getPhoto(id);
  if (!existing) return null;
  const copy = { ...existing, id: uid(), inspectionId };
  await savePhoto(copy);
  return copy.id;
}

const urlCache = new Map<string, string>();

export async function photoUrl(id: string, variant: 'thumb' | 'full'): Promise<string | null> {
  const key = `${id}:${variant}`;
  const cached = urlCache.get(key);
  if (cached) return cached;
  const photo = await getPhoto(id);
  if (!photo) return null;
  const url = URL.createObjectURL(variant === 'thumb' ? photo.thumb : photo.blob);
  urlCache.set(key, url);
  return url;
}

export function revokePhotoUrls(id: string): void {
  for (const variant of ['thumb', 'full']) {
    const key = `${id}:${variant}`;
    const url = urlCache.get(key);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(key);
  }
  photoVersion.set(id, (photoVersion.get(id) ?? 0) + 1);
}

/** Incremente quand une photo est remplacee, pour forcer le rechargement des vignettes. */
export const photoVersion = new Map<string, number>();
