import type { Inspection, Item, PhotoTarget, Room, Section } from '../types';

export function findRoom(inspection: Inspection, roomId: string): Room | undefined {
  return inspection.rooms.find((r) => r.id === roomId);
}

export function findItem(inspection: Inspection, roomId: string, itemId: string): { room: Room; section: Section; item: Item } | undefined {
  const room = findRoom(inspection, roomId);
  if (!room) return undefined;
  for (const section of room.sections) {
    const item = section.items.find((i) => i.id === itemId);
    if (item) return { room, section, item };
  }
  return undefined;
}

export interface FlatItem {
  room: Room;
  section: Section;
  item: Item;
}

export function flatItems(inspection: Inspection): FlatItem[] {
  return inspection.rooms.flatMap((room) => room.sections.flatMap((section) => section.items.map((item) => ({ room, section, item }))));
}

/** Tableau d'identifiants de photos (mutable) correspondant a la cible. */
export function targetPhotoIds(inspection: Inspection, target: PhotoTarget): string[] | undefined {
  switch (target.kind) {
    case 'cover':
      return undefined;
    case 'key':
      return inspection.keys.find((k) => k.id === target.keyId)?.photoIds;
    case 'meter':
      return inspection.meters.find((m) => m.id === target.meterId)?.photoIds;
    case 'room':
      return findRoom(inspection, target.roomId)?.photoIds;
    case 'item':
      return findItem(inspection, target.roomId, target.itemId)?.item.photoIds;
  }
}

export function targetLabel(inspection: Inspection, target: PhotoTarget): string {
  switch (target.kind) {
    case 'cover':
      return 'Photo de couverture';
    case 'key':
      return `Clés · ${inspection.keys.find((k) => k.id === target.keyId)?.label ?? ''}`;
    case 'meter':
      return inspection.meters.find((m) => m.id === target.meterId)?.label ?? 'Compteur';
    case 'room':
      return `${findRoom(inspection, target.roomId)?.name ?? ''} · vue générale`;
    case 'item': {
      const found = findItem(inspection, target.roomId, target.itemId);
      return found ? `${found.room.name} · ${found.item.name}` : '';
    }
  }
}

export function removePhotoEverywhere(inspection: Inspection, photoId: string): void {
  const strip = (ids: string[]) => {
    const index = ids.indexOf(photoId);
    if (index >= 0) ids.splice(index, 1);
  };
  if (inspection.property.coverPhotoId === photoId) inspection.property.coverPhotoId = undefined;
  inspection.keys.forEach((k) => strip(k.photoIds));
  inspection.meters.forEach((m) => strip(m.photoIds));
  inspection.rooms.forEach((room) => {
    strip(room.photoIds);
    room.sections.forEach((s) => s.items.forEach((i) => strip(i.photoIds)));
  });
}

export function itemPhotoIds(item: Item): string[] {
  return [...item.photoIds, ...(item.entry?.photoIds ?? [])];
}

export function sectionPhotoIds(section: Section): string[] {
  return section.items.flatMap(itemPhotoIds);
}

export function roomPhotoIds(room: Room): string[] {
  return [...room.photoIds, ...room.sections.flatMap(sectionPhotoIds)];
}

export function allPhotoIds(inspection: Inspection): string[] {
  return [
    ...(inspection.property.coverPhotoId ? [inspection.property.coverPhotoId] : []),
    ...inspection.keys.flatMap((k) => k.photoIds),
    ...inspection.meters.flatMap((m) => m.photoIds),
    ...inspection.rooms.flatMap(roomPhotoIds),
  ];
}

export function samePhotoTarget(a: PhotoTarget, b: PhotoTarget): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
