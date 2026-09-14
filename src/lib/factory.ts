import templateJson from '../seed/template.json';
import type { Condition, Inspection, InspectionType, Item, KeyValue, PhotoRecord, Room, RoomCheck, Section } from '../types';
import { getInspection, saveInspection, savePhoto } from './db';
import { GENERAL_STATE_OPTIONS, todayIso } from './format';
import { uid } from './ids';
import { duplicatePhoto } from './photos';

interface SeedPhoto {
  file: string;
  width: number;
  height: number;
}

interface SeedKv {
  label: string;
  value: string;
}

/** Forme de src/seed/template.json, produit par tools/extract_template.py. */
interface SeedTemplate {
  property: { reference: string; address: string; postalCode: string; city: string; description: string; cover: SeedPhoto };
  parties: { landlord: string; manager: string; executedBy: string; tenant: Inspection['parties']['tenant'] };
  dates: { inspectionDate: string; leaseStart: string; moveInDate: string };
  keys: { label: string; type: string; description: string; quantity: number; photos: SeedPhoto[] }[];
  meters: { kind: string; label: string; reference: string; provider: string; reading: string; readingDate: string; location: string; photos: SeedPhoto[] }[];
  rooms: {
    name: string;
    comment: string;
    generalState: SeedKv[];
    photos: SeedPhoto[];
    sections: {
      name: string;
      items: { name: string; condition: string | null; comment: string; characteristics: SeedKv[]; parts: SeedKv[]; issues: { type: string; comment: string }[]; photos: SeedPhoto[] }[];
    }[];
  }[];
}

export const template = templateJson as unknown as SeedTemplate;

export function newItem(name: string): Item {
  return { id: uid(), name, condition: null, comment: '', characteristics: [], parts: [], issues: [], photoIds: [] };
}

export function newSection(name: string, itemNames: string[] = []): Section {
  return { id: uid(), name, items: itemNames.map(newItem) };
}

export function defaultGeneralState(): RoomCheck[] {
  return Object.entries(GENERAL_STATE_OPTIONS).map(([label, options]) => ({ id: uid(), label, value: options[0] }));
}

export function newRoom(name: string): Room {
  return {
    id: uid(),
    name,
    generalState: defaultGeneralState(),
    comment: '',
    photoIds: [],
    sections: [
      newSection('Base', ['Sol', 'Murs', 'Plafond', 'Porte', 'Fenêtre']),
      newSection('Conformité', ['Prises électriques', 'Interrupteurs', 'Éclairage - plafond']),
    ],
  };
}

export const ROOM_PRESETS = ['Entrée', 'Séjour', 'Cuisine', 'Chambre', 'Salle de bain', "Salle d'eau", 'Toilette', 'Couloir', 'Bureau', 'Cellier', 'Balcon', 'Cave', 'Parking'];
export const SECTION_PRESETS = ['Base', 'Spécificités', 'Conformité', 'Appareils', 'Meubles & décorations', 'Équipements'];

function emptyInspection(type: InspectionType, sourceLabel: string): Inspection {
  const now = new Date().toISOString();
  return {
    id: uid(),
    type,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    sourceLabel,
    property: { reference: '', address: '', postalCode: '', city: '', description: '' },
    parties: { landlord: '', manager: '', executedBy: '', tenant: { name: '', phone: '', email: '', birthDate: '', birthPlace: '' } },
    dates: { inspectionDate: todayIso(), leaseStart: '', moveInDate: '', moveOutDate: type === 'sortie' ? todayIso() : '' },
    keys: [],
    meters: [],
    rooms: [],
    generalComment: '',
    signatures: { place: '' },
  };
}

async function importSeedPhoto(photo: SeedPhoto, inspectionId: string): Promise<string> {
  const response = await fetch(`${import.meta.env.BASE_URL}seed/${photo.file}`);
  if (!response.ok) throw new Error(`Photo du modèle introuvable : ${photo.file}`);
  const blob = await response.blob();
  const record: PhotoRecord = {
    id: uid(),
    inspectionId,
    blob,
    thumb: blob,
    width: photo.width,
    height: photo.height,
    createdAt: new Date().toISOString(),
    source: 'pdf',
    name: photo.file,
  };
  await savePhoto(record);
  return record.id;
}

const kv = (rows: SeedKv[]): KeyValue[] => rows.map((r) => ({ id: uid(), label: r.label, value: r.value }));

/** Etat des lieux pre-rempli a partir du PDF source (structure, valeurs d'entree et photos). */
async function buildFromTemplate(sourceLabel: string): Promise<Inspection> {
  const inspection = emptyInspection('entree', sourceLabel);
  const photos = (list: SeedPhoto[]) => Promise.all(list.map((p) => importSeedPhoto(p, inspection.id)));
  const { property, parties, dates } = template;
  inspection.property = {
    reference: property.reference,
    address: property.address,
    postalCode: property.postalCode,
    city: property.city,
    description: property.description,
    coverPhotoId: await importSeedPhoto(property.cover, inspection.id),
  };
  inspection.parties = { landlord: parties.landlord, manager: parties.manager, executedBy: parties.executedBy, tenant: { ...parties.tenant } };
  inspection.dates = { ...inspection.dates, ...dates };
  inspection.keys = await Promise.all(
    template.keys.map(async (k) => ({ id: uid(), label: k.label, type: k.type, description: k.description, quantity: k.quantity, photoIds: await photos(k.photos) })),
  );
  inspection.meters = await Promise.all(
    template.meters.map(async (m) => ({
      id: uid(),
      kind: m.kind as Inspection['meters'][number]['kind'],
      label: m.label,
      reference: m.reference,
      provider: m.provider,
      reading: m.reading,
      readingDate: m.readingDate,
      location: m.location,
      photoIds: await photos(m.photos),
    })),
  );
  inspection.rooms = await Promise.all(
    template.rooms.map(async (room) => ({
      id: uid(),
      name: room.name,
      comment: room.comment,
      generalState: room.generalState.map((g) => ({ id: uid(), label: g.label, value: g.value })),
      photoIds: await photos(room.photos),
      sections: await Promise.all(
        room.sections.map(async (section) => ({
          id: uid(),
          name: section.name,
          items: await Promise.all(
            section.items.map(async (item) => ({
              id: uid(),
              name: item.name,
              condition: item.condition as Condition | null,
              comment: item.comment,
              characteristics: kv(item.characteristics),
              parts: kv(item.parts),
              issues: item.issues.map((i) => ({ id: uid(), type: i.type, comment: i.comment })),
              photoIds: await photos(item.photos),
            })),
          ),
        })),
      ),
    })),
  );
  return inspection;
}

/** Transforme un etat d'entree en etat de sortie : les valeurs d'entree deviennent la reference. */
function toExit(entry: Inspection, photoMap: (id: string) => string): Inspection {
  const exit: Inspection = structuredClone(entry);
  const now = new Date().toISOString();
  Object.assign(exit, { type: 'sortie', status: 'draft', createdAt: now, updatedAt: now, validatedAt: undefined, generalComment: '', signatures: { place: entry.signatures.place } });
  exit.dates = { ...entry.dates, inspectionDate: todayIso(), moveOutDate: todayIso() };
  exit.property.coverPhotoId = entry.property.coverPhotoId ? photoMap(entry.property.coverPhotoId) : undefined;
  exit.keys.forEach((k) => (k.photoIds = []));
  exit.meters.forEach((m) => {
    m.entryReading = m.reading;
    m.reading = '';
    m.readingDate = todayIso();
    m.photoIds = [];
  });
  exit.rooms.forEach((room) => {
    room.photoIds = [];
    room.comment = '';
    room.sections.forEach((section) =>
      section.items.forEach((item) => {
        item.entry = { condition: item.condition, comment: item.comment, issues: item.issues, photoIds: item.photoIds.map(photoMap) };
        item.condition = null;
        item.comment = '';
        item.issues = [];
        item.photoIds = [];
      }),
    );
  });
  return exit;
}

export async function createFromTemplate(type: InspectionType): Promise<Inspection> {
  const entry = await buildFromTemplate('Modèle PDF · 7 bd du Général Leclerc');
  const inspection = type === 'entree' ? entry : toExit(entry, (id) => id);
  if (type === 'sortie') inspection.sourceLabel = "Entrée du PDF (20/01/2024)";
  await saveInspection(inspection);
  return inspection;
}

export async function createBlank(type: InspectionType): Promise<Inspection> {
  const inspection = emptyInspection(type, 'Logement vierge');
  inspection.rooms = ['Entrée', 'Séjour', 'Cuisine', 'Chambre', 'Salle de bain', 'Toilette'].map(newRoom);
  inspection.keys = [{ id: uid(), label: "Porte d'entrée", type: 'Clé', description: '', quantity: 1, photoIds: [] }];
  inspection.meters = [
    { id: uid(), kind: 'electricite', label: "Compteur d'électricité", reference: '', provider: '', reading: '', readingDate: todayIso(), location: '', photoIds: [] },
    { id: uid(), kind: 'eau', label: "Compteur d'eau", reference: '', provider: '', reading: '', readingDate: todayIso(), location: '', photoIds: [] },
  ];
  await saveInspection(inspection);
  return inspection;
}

export async function createExitFrom(entryId: string): Promise<Inspection> {
  const entry = await getInspection(entryId);
  if (!entry) throw new Error("État des lieux d'entrée introuvable");
  const newId = uid();
  const copies = new Map<string, string>();
  const ids = [
    ...(entry.property.coverPhotoId ? [entry.property.coverPhotoId] : []),
    ...entry.rooms.flatMap((r) => r.sections.flatMap((s) => s.items.flatMap((i) => i.photoIds))),
  ];
  for (const id of ids) {
    const copy = await duplicatePhoto(id, newId);
    if (copy) copies.set(id, copy);
  }
  const exit = toExit(entry, (id) => copies.get(id) ?? id);
  exit.id = newId;
  exit.entryInspectionId = entry.id;
  exit.sourceLabel = `Entrée du ${entry.dates.inspectionDate.split('-').reverse().join('/')}`;
  await saveInspection(exit);
  return exit;
}
