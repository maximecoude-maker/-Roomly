import type { Condition, Inspection, InspectionType, Item } from '../types';

export const CONDITIONS: { value: Condition; label: string; short: string; rank: number }[] = [
  { value: 'neuf', label: 'Neuf', short: 'Neuf', rank: 0 },
  { value: 'tres_bon', label: 'Très bon', short: 'Très bon', rank: 1 },
  { value: 'bon', label: 'Bon', short: 'Bon', rank: 2 },
  { value: 'usage', label: 'Usagé', short: 'Usagé', rank: 3 },
  { value: 'mauvais', label: 'Mauvais', short: 'Mauvais', rank: 4 },
  { value: 'hs', label: 'Hors service', short: 'HS', rank: 5 },
];

export function conditionLabel(value: Condition | null | undefined): string {
  return CONDITIONS.find((c) => c.value === value)?.label ?? 'Non renseigné';
}

export function conditionRank(value: Condition | null | undefined): number {
  return CONDITIONS.find((c) => c.value === value)?.rank ?? -1;
}

/** Vrai si l'etat de sortie est moins bon que l'etat d'entree. */
export function isDegraded(item: Item): boolean {
  if (!item.entry?.condition || !item.condition) return false;
  return conditionRank(item.condition) > conditionRank(item.entry.condition);
}

export function needsAttention(item: Item): boolean {
  return item.issues.length > 0 || conditionRank(item.condition) >= 3 || isDegraded(item);
}

export const ISSUE_TYPES = ['Dégâts', 'Usure', 'Salissure', 'Manquant', 'Dysfonctionnement'];

export const COMMENT_SUGGESTIONS = ['Rayures', 'Traces', 'Éclat', 'Tache', 'Trou', 'Fissure', 'Propre', 'Fonctionne', 'Ne fonctionne pas'];

export const GENERAL_STATE_OPTIONS: Record<string, string[]> = {
  Ordre: ['Ok', 'Encombré'],
  Propreté: ['Ok', 'À nettoyer', 'Sale'],
  Peinture: ['Neuf', 'Ok', 'Usagée', 'À refaire'],
  Ventilation: ['Suffisante', 'Insuffisante', 'Absente'],
  'Installation électrique': ['Conforme', 'À vérifier', 'Non conforme'],
  Humidité: ['Aucune', 'Légère', 'Importante'],
  Boiseries: ['Ok', 'Usagées', 'Abîmées'],
};

export function typeLabel(type: InspectionType): string {
  return type === 'entree' ? "d'entrée" : 'de sortie';
}

export function titleFor(inspection: Inspection): string {
  return `État des lieux ${typeLabel(inspection.type)}`;
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function fullAddress(inspection: Inspection): string {
  const { address, postalCode, city } = inspection.property;
  return [address, [postalCode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

export interface Progress {
  done: number;
  total: number;
  photos: number;
  attention: number;
}

export function roomProgress(room: Inspection['rooms'][number]): Progress {
  let done = 0;
  let total = 0;
  let photos = room.photoIds.length;
  let attention = 0;
  for (const section of room.sections) {
    for (const item of section.items) {
      total += 1;
      if (item.condition) done += 1;
      photos += item.photoIds.length;
      if (needsAttention(item)) attention += 1;
    }
  }
  return { done, total, photos, attention };
}

export function inspectionProgress(inspection: Inspection): Progress {
  return inspection.rooms.map(roomProgress).reduce(
    (acc, p) => ({ done: acc.done + p.done, total: acc.total + p.total, photos: acc.photos + p.photos, attention: acc.attention + p.attention }),
    { done: 0, total: 0, photos: 0, attention: 0 },
  );
}

export function pdfFilename(inspection: Inspection): string {
  const slug = (inspection.property.address || 'logement')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `etat-des-lieux-${inspection.type}-${slug}-${inspection.dates.inspectionDate || 'sans-date'}.pdf`;
}
