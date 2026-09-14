export type InspectionType = 'entree' | 'sortie';
export type InspectionStatus = 'draft' | 'validated';
export type Condition = 'neuf' | 'tres_bon' | 'bon' | 'usage' | 'mauvais' | 'hs';

export interface KeyValue {
  id: string;
  label: string;
  value: string;
}

export interface RoomCheck {
  id: string;
  label: string;
  value: string;
}

export interface Issue {
  id: string;
  type: string;
  comment: string;
}

/** Instantane de l'etat d'entree, conserve sur un etat des lieux de sortie. */
export interface EntrySnapshot {
  condition: Condition | null;
  comment: string;
  issues: Issue[];
  photoIds: string[];
}

export interface Item {
  id: string;
  name: string;
  condition: Condition | null;
  comment: string;
  characteristics: KeyValue[];
  parts: KeyValue[];
  issues: Issue[];
  photoIds: string[];
  entry?: EntrySnapshot;
}

export interface Section {
  id: string;
  name: string;
  items: Item[];
}

export interface Room {
  id: string;
  name: string;
  generalState: RoomCheck[];
  comment: string;
  photoIds: string[];
  sections: Section[];
}

export interface KeyEntry {
  id: string;
  label: string;
  type: string;
  description: string;
  quantity: number;
  photoIds: string[];
}

export type MeterKind = 'electricite' | 'eau' | 'gaz' | 'autre';

export interface Meter {
  id: string;
  kind: MeterKind;
  label: string;
  reference: string;
  provider: string;
  reading: string;
  readingDate: string;
  location: string;
  photoIds: string[];
  entryReading?: string;
}

export interface Tenant {
  name: string;
  phone: string;
  email: string;
  birthDate: string;
  birthPlace: string;
}

export interface Inspection {
  id: string;
  type: InspectionType;
  status: InspectionStatus;
  createdAt: string;
  updatedAt: string;
  validatedAt?: string;
  sourceLabel: string;
  entryInspectionId?: string;
  property: {
    reference: string;
    address: string;
    postalCode: string;
    city: string;
    description: string;
    coverPhotoId?: string;
  };
  parties: {
    landlord: string;
    manager: string;
    executedBy: string;
    tenant: Tenant;
  };
  dates: {
    inspectionDate: string;
    leaseStart: string;
    moveInDate: string;
    moveOutDate: string;
  };
  keys: KeyEntry[];
  meters: Meter[];
  rooms: Room[];
  generalComment: string;
  signatures: {
    place: string;
    tenant?: string;
    landlord?: string;
  };
}

export interface PhotoRecord {
  id: string;
  inspectionId: string;
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
  createdAt: string;
  source: 'pdf' | 'camera' | 'import';
  name: string;
}

/** Cible d'une photo : ou elle est rattachee dans l'etat des lieux. */
export type PhotoTarget =
  | { kind: 'cover' }
  | { kind: 'key'; keyId: string }
  | { kind: 'meter'; meterId: string }
  | { kind: 'room'; roomId: string }
  | { kind: 'item'; roomId: string; sectionId: string; itemId: string };
