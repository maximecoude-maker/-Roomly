import type { Inspection, PhotoRecord } from '../types';
import { listPhotos, saveInspection, savePhoto } from './db';
import { uid } from './ids';

interface BackupPhoto extends Omit<PhotoRecord, 'blob' | 'thumb'> {
  blob: string;
  thumb: string;
}

interface BackupFile {
  app: 'etat-des-lieux';
  version: 1;
  exportedAt: string;
  inspection: Inspection;
  photos: BackupPhoto[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export async function exportBackup(inspection: Inspection): Promise<Blob> {
  const photos = await listPhotos(inspection.id);
  const serialized: BackupPhoto[] = [];
  for (const photo of photos) {
    serialized.push({ ...photo, blob: await blobToDataUrl(photo.blob), thumb: await blobToDataUrl(photo.thumb) });
  }
  const file: BackupFile = { app: 'etat-des-lieux', version: 1, exportedAt: new Date().toISOString(), inspection, photos: serialized };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** Importe une sauvegarde sous de nouveaux identifiants (aucun ecrasement possible). */
export async function importBackup(file: File): Promise<Inspection> {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(await file.text()) as BackupFile;
  } catch {
    throw new Error("Le fichier n'est pas une sauvegarde valide");
  }
  if (parsed.app !== 'etat-des-lieux' || !parsed.inspection) throw new Error("Le fichier n'est pas une sauvegarde d'état des lieux");
  const newInspectionId = uid();
  const idMap = new Map(parsed.photos.map((p) => [p.id, uid()]));
  let json = JSON.stringify(parsed.inspection);
  idMap.forEach((next, previous) => {
    json = json.split(`"${previous}"`).join(`"${next}"`);
  });
  const inspection = JSON.parse(json) as Inspection;
  inspection.id = newInspectionId;
  inspection.updatedAt = new Date().toISOString();
  for (const photo of parsed.photos) {
    await savePhoto({
      ...photo,
      id: idMap.get(photo.id) ?? uid(),
      inspectionId: newInspectionId,
      blob: await dataUrlToBlob(photo.blob),
      thumb: await dataUrlToBlob(photo.thumb),
    });
  }
  await saveInspection(inspection);
  return inspection;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
