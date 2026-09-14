import { jsPDF } from 'jspdf';
import type { Condition, Inspection, Item } from '../types';
import { getPhoto } from './db';
import { conditionLabel, formatDate, fullAddress, inspectionProgress, isDegraded, needsAttention, titleFor } from './format';
import { allPhotoIds } from './tree';

type Rgb = [number, number, number];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = 22;
const BOTTOM = PAGE_H - 18;

const INK: Rgb = [17, 21, 28];
const MUTED: Rgb = [104, 112, 125];
const LINE: Rgb = [224, 227, 233];
const SOFT: Rgb = [245, 246, 248];
const DARK: Rgb = [31, 38, 50];
const DANGER: Rgb = [196, 43, 43];

const COND_COLORS: Record<Condition | 'none', Rgb> = {
  neuf: [21, 128, 61],
  tres_bon: [34, 154, 84],
  bon: [80, 140, 30],
  usage: [202, 125, 10],
  mauvais: [220, 88, 20],
  hs: [196, 43, 43],
  none: [150, 156, 166],
};

/** Les polices standard PDF ne couvrent que le jeu WinAnsi : on normalise le reste. */
function clean(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/→/g, '->')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/[  ]/g, ' ')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff€]/g, '');
}

interface PdfImage {
  data: string;
  width: number;
  height: number;
}

async function loadImage(id: string): Promise<PdfImage | null> {
  const photo = await getPhoto(id);
  if (!photo) return null;
  const url = URL.createObjectURL(photo.blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Photo illisible : ${photo.name}`));
      el.src = url;
    });
    const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.8), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

class PdfWriter {
  pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  y = TOP;
  images = new Map<string, PdfImage | null>();

  constructor(private readonly inspection: Inspection) {}

  font(size: number, style: 'normal' | 'bold' = 'normal', color: Rgb = INK) {
    this.pdf.setFont('helvetica', style);
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(...color);
  }

  ensure(height: number) {
    if (this.y + height > BOTTOM) this.newPage();
  }

  newPage() {
    this.pdf.addPage();
    this.y = TOP;
  }

  /** Ecrit un paragraphe avec retour a la ligne ; renvoie la hauteur utilisee. */
  paragraph(text: string, options: { size?: number; style?: 'normal' | 'bold'; color?: Rgb; x?: number; width?: number; gap?: number } = {}) {
    const { size = 9, style = 'normal', color = INK, x = MARGIN, width = CONTENT_W, gap = 1.5 } = options;
    this.font(size, style, color);
    const lines = this.pdf.splitTextToSize(clean(text), width) as string[];
    const lineH = size * 0.42;
    for (const line of lines) {
      this.ensure(lineH);
      this.pdf.text(line, x, this.y + lineH * 0.8);
      this.y += lineH;
    }
    this.y += gap;
  }

  heading(text: string) {
    this.ensure(18);
    this.font(15, 'bold', INK);
    this.pdf.text(clean(text), MARGIN, this.y + 6);
    this.y += 9;
    this.pdf.setDrawColor(...INK);
    this.pdf.setLineWidth(0.6);
    this.pdf.line(MARGIN, this.y, MARGIN + 18, this.y);
    this.y += 5;
  }

  bar(text: string, right?: string) {
    this.ensure(26);
    this.pdf.setFillColor(...DARK);
    this.pdf.roundedRect(MARGIN, this.y, CONTENT_W, 9, 1.2, 1.2, 'F');
    this.font(11, 'bold', [255, 255, 255]);
    this.pdf.text(clean(text), MARGIN + 3.5, this.y + 6.1);
    if (right) {
      this.font(8, 'normal', [200, 206, 216]);
      this.pdf.text(clean(right), PAGE_W - MARGIN - 3.5, this.y + 6, { align: 'right' });
    }
    this.y += 13;
  }

  subheading(text: string) {
    this.ensure(16);
    this.font(8.5, 'bold', MUTED);
    this.pdf.text(clean(text.toUpperCase()), MARGIN, this.y + 3.5);
    this.y += 5.5;
    this.pdf.setDrawColor(...LINE);
    this.pdf.setLineWidth(0.3);
    this.pdf.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
    this.y += 2.5;
  }

  pill(text: string, xRight: number, y: number, color: Rgb, outline = false): number {
    this.font(7.5, 'bold', outline ? color : [255, 255, 255]);
    const label = clean(text);
    const w = this.pdf.getTextWidth(label) + 5;
    const x = xRight - w;
    if (outline) {
      this.pdf.setDrawColor(...color);
      this.pdf.setLineWidth(0.3);
      this.pdf.roundedRect(x, y, w, 5, 2.5, 2.5, 'S');
    } else {
      this.pdf.setFillColor(...color);
      this.pdf.roundedRect(x, y, w, 5, 2.5, 2.5, 'F');
    }
    this.pdf.text(label, x + 2.5, y + 3.5);
    return x;
  }

  async image(id: string): Promise<PdfImage | null> {
    if (!this.images.has(id)) this.images.set(id, await loadImage(id).catch(() => null));
    return this.images.get(id) ?? null;
  }

  /** Dessine une image centree dans un cadre, sans deformation. */
  async fitImage(id: string, x: number, y: number, w: number, h: number) {
    this.pdf.setFillColor(...SOFT);
    this.pdf.rect(x, y, w, h, 'F');
    const img = await this.image(id);
    if (!img) return;
    const ratio = Math.min(w / img.width, h / img.height);
    const dw = img.width * ratio;
    const dh = img.height * ratio;
    this.pdf.addImage(img.data, 'JPEG', x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, id, 'FAST');
  }

  async photoGrid(ids: string[], columns: number, onPhoto: () => void) {
    if (ids.length === 0) return;
    const gap = 2.5;
    const cellW = (CONTENT_W - gap * (columns - 1)) / columns;
    const cellH = cellW * 0.75;
    for (let i = 0; i < ids.length; i += columns) {
      this.ensure(cellH + gap);
      const row = ids.slice(i, i + columns);
      for (let c = 0; c < row.length; c += 1) {
        await this.fitImage(row[c], MARGIN + c * (cellW + gap), this.y, cellW, cellH);
        onPhoto();
      }
      this.y += cellH + gap;
    }
    this.y += 1.5;
  }

  keyValues(rows: [string, string][], columns = 2) {
    const colW = CONTENT_W / columns;
    const rowH = 5.2;
    for (let i = 0; i < rows.length; i += columns) {
      this.ensure(rowH);
      rows.slice(i, i + columns).forEach(([label, value], c) => {
        const x = MARGIN + c * colW;
        this.font(8, 'normal', MUTED);
        this.pdf.text(clean(label), x, this.y + 3.6);
        this.font(8.5, 'bold', INK);
        const text = this.pdf.splitTextToSize(clean(value || '-'), colW - 42)[0] as string;
        this.pdf.text(text, x + 38, this.y + 3.6);
      });
      this.y += rowH;
    }
    this.y += 2;
  }

  table(headers: string[], widths: number[], rows: string[][]) {
    const rowH = 7;
    const drawHeader = () => {
      this.pdf.setFillColor(...SOFT);
      this.pdf.rect(MARGIN, this.y, CONTENT_W, rowH, 'F');
      this.font(7.5, 'bold', MUTED);
      let x = MARGIN + 2;
      headers.forEach((h, i) => {
        this.pdf.text(clean(h.toUpperCase()), x, this.y + 4.7);
        x += widths[i];
      });
      this.y += rowH;
    };
    this.ensure(rowH * 2);
    drawHeader();
    for (const row of rows) {
      if (this.y + rowH > BOTTOM) {
        this.newPage();
        drawHeader();
      }
      this.font(8.5, 'normal', INK);
      let x = MARGIN + 2;
      row.forEach((cell, i) => {
        const text = this.pdf.splitTextToSize(clean(cell || '-'), widths[i] - 3)[0] as string;
        this.pdf.text(text, x, this.y + 4.7);
        x += widths[i];
      });
      this.pdf.setDrawColor(...LINE);
      this.pdf.setLineWidth(0.2);
      this.pdf.line(MARGIN, this.y + rowH, PAGE_W - MARGIN, this.y + rowH);
      this.y += rowH;
    }
    this.y += 4;
  }

  decorate() {
    const total = this.pdf.getNumberOfPages();
    const title = `${titleFor(this.inspection)} - ${fullAddress(this.inspection)}`;
    for (let page = 2; page <= total; page += 1) {
      this.pdf.setPage(page);
      this.font(7.5, 'bold', MUTED);
      this.pdf.text(clean(title), MARGIN, 12);
      this.font(7.5, 'normal', MUTED);
      this.pdf.text(formatDate(this.inspection.dates.inspectionDate), PAGE_W - MARGIN, 12, { align: 'right' });
      this.pdf.setDrawColor(...LINE);
      this.pdf.setLineWidth(0.2);
      this.pdf.line(MARGIN, 14.5, PAGE_W - MARGIN, 14.5);
      this.pdf.line(MARGIN, PAGE_H - 12.5, PAGE_W - MARGIN, PAGE_H - 12.5);
      this.pdf.text(clean(this.inspection.parties.landlord), MARGIN, PAGE_H - 8);
      this.pdf.text(`Page ${page} / ${total}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
    }
  }
}

function itemDetails(item: Item): string {
  return [...item.characteristics, ...item.parts]
    .filter((kv) => kv.label || kv.value)
    .map((kv) => `${kv.label}${kv.value ? ` : ${kv.value}` : ''}`)
    .join('  ·  ');
}

async function writeCover(w: PdfWriter, inspection: Inspection, onPhoto: () => void) {
  const { pdf } = w;
  pdf.setFillColor(...DARK);
  pdf.rect(0, 0, PAGE_W, 6, 'F');
  w.y = 24;
  w.font(9, 'bold', MUTED);
  pdf.text(clean((inspection.property.reference || 'État des lieux').toUpperCase()), MARGIN, w.y);
  w.y += 11;
  w.font(24, 'bold', INK);
  pdf.text(clean(titleFor(inspection)), MARGIN, w.y);
  w.y += 8;
  w.paragraph(fullAddress(inspection) || 'Adresse non renseignée', { size: 12, color: INK, gap: 0.5 });
  if (inspection.property.reference || inspection.property.description) {
    w.paragraph([inspection.property.reference, inspection.property.description].filter(Boolean).join(' - '), { size: 9.5, color: MUTED, gap: 4 });
  }
  if (inspection.property.coverPhotoId) {
    await w.fitImage(inspection.property.coverPhotoId, MARGIN, w.y, CONTENT_W, 95);
    onPhoto();
    w.y += 101;
  }
  const tenant = inspection.parties.tenant;
  w.subheading('Parties');
  w.keyValues([
    ['Bailleur', inspection.parties.landlord],
    ['Locataire', tenant.name],
    ['Gestionnaire', inspection.parties.manager],
    ['Téléphone', tenant.phone],
    ['Réalisé par', inspection.parties.executedBy],
    ['E-mail', tenant.email],
  ]);
  w.subheading('Dates');
  const dates: [string, string][] = [
    ["Date de l'état des lieux", formatDate(inspection.dates.inspectionDate)],
    ['Début du bail', formatDate(inspection.dates.leaseStart)],
    ["Date d'entrée", formatDate(inspection.dates.moveInDate)],
  ];
  if (inspection.type === 'sortie') dates.push(['Date de sortie', formatDate(inspection.dates.moveOutDate)]);
  w.keyValues(dates);

  const progress = inspectionProgress(inspection);
  w.subheading('Synthèse');
  const stats: [string, string][] = [
    ['Pièces', String(inspection.rooms.length)],
    ['Éléments', `${progress.done}/${progress.total}`],
    ['Photos', String(progress.photos)],
    ['À signaler', String(progress.attention)],
  ];
  const boxW = (CONTENT_W - 3 * 3) / 4;
  w.ensure(18);
  stats.forEach(([label, value], i) => {
    const x = MARGIN + i * (boxW + 3);
    pdf.setFillColor(...SOFT);
    pdf.roundedRect(x, w.y, boxW, 15, 1.5, 1.5, 'F');
    w.font(14, 'bold', INK);
    pdf.text(clean(value), x + 4, w.y + 7.5);
    w.font(7.5, 'normal', MUTED);
    pdf.text(clean(label), x + 4, w.y + 12);
  });
  w.y += 19;
}

async function writeRooms(w: PdfWriter, inspection: Inspection, onPhoto: () => void) {
  const isExit = inspection.type === 'sortie';
  for (const room of inspection.rooms) {
    const photoCount = room.photoIds.length + room.sections.reduce((n, s) => n + s.items.reduce((m, i) => m + i.photoIds.length, 0), 0);
    w.bar(room.name, `${photoCount} photo${photoCount > 1 ? 's' : ''}`);
    if (room.generalState.length > 0) w.keyValues(room.generalState.map((g) => [g.label, g.value]), 3);
    if (room.comment) w.paragraph(room.comment, { size: 9, gap: 2.5 });
    await w.photoGrid(room.photoIds, 3, onPhoto);

    for (const section of room.sections) {
      if (section.items.length === 0) continue;
      w.subheading(section.name);
      for (const item of section.items) {
        // Garde ensemble le titre, le texte et la premiere rangee de photos.
        const textLines = (itemDetails(item) ? 1 : 0) + (item.comment ? 1 : 0) + item.issues.length + (item.entry?.comment ? 1 : 0);
        const firstPhotoRow = item.photoIds.length ? 37 : item.entry?.photoIds.length ? 26 : 0;
        w.ensure(8 + textLines * 5 + firstPhotoRow);
        const top = w.y;
        w.font(9.5, 'bold', INK);
        w.pdf.text(clean(item.name), MARGIN, top + 4);
        const color = COND_COLORS[item.condition ?? 'none'];
        let x = w.pill(isExit ? `Sortie : ${conditionLabel(item.condition)}` : conditionLabel(item.condition), PAGE_W - MARGIN, top + 0.5, color);
        if (isExit && item.entry) {
          x = w.pill(`Entrée : ${conditionLabel(item.entry.condition)}`, x - 2, top + 0.5, COND_COLORS[item.entry.condition ?? 'none'], true);
        }
        if (needsAttention(item)) {
          w.font(7.5, 'bold', DANGER);
          w.pdf.text(isDegraded(item) ? 'DÉGRADATION' : 'À SIGNALER', x - 3, top + 3.9, { align: 'right' });
        }
        w.y = top + 7;
        const details = itemDetails(item);
        if (details) w.paragraph(details, { size: 8, color: MUTED, gap: 1 });
        if (isExit && item.entry?.comment) w.paragraph(`A l'entrée : ${item.entry.comment}`, { size: 8, color: MUTED, gap: 1 });
        if (item.comment) w.paragraph(item.comment, { size: 9, gap: 1 });
        for (const issue of item.issues) w.paragraph(`Constat - ${issue.type}${issue.comment ? ` : ${issue.comment}` : ''}`, { size: 8.5, style: 'bold', color: DANGER, gap: 1 });
        if (isExit && item.entry?.issues.length) {
          w.paragraph(`Constats à l'entrée : ${item.entry.issues.map((i) => `${i.type} ${i.comment}`).join(' ; ')}`, { size: 8, color: MUTED, gap: 1 });
        }
        if (item.photoIds.length) {
          w.y += 1;
          await w.photoGrid(item.photoIds, 4, onPhoto);
        }
        if (isExit && item.entry?.photoIds.length) {
          w.ensure(28); // libelle + premiere rangee de vignettes sur la meme page
          w.paragraph("Photos de l'entrée", { size: 7.5, color: MUTED, gap: 0.8 });
          await w.photoGrid(item.entry.photoIds, 6, onPhoto);
        }
        w.pdf.setDrawColor(...LINE);
        w.pdf.setLineWidth(0.15);
        w.pdf.line(MARGIN, w.y + 0.5, PAGE_W - MARGIN, w.y + 0.5);
        w.y += 2.5;
      }
    }
    w.y += 4;
  }
}

async function writeSignatures(w: PdfWriter, inspection: Inspection) {
  w.ensure(110);
  w.heading('Observations et signatures');
  if (inspection.generalComment) {
    w.subheading('Observations générales');
    w.paragraph(inspection.generalComment, { size: 9, gap: 4 });
  }
  w.paragraph(
    "Le présent état des lieux a été établi contradictoirement entre les parties, qui le reconnaissent exact, conformément à l'article 3-2 de la loi n° 89-462 du 6 juillet 1989. Il est joint au contrat de location.",
    { size: 8.5, color: MUTED, gap: 4 },
  );
  const place = inspection.signatures.place || inspection.property.city;
  w.paragraph(`Fait à ${place || '...'}, le ${formatDate(inspection.dates.inspectionDate)}, en autant d'exemplaires que de parties.`, { size: 9.5, gap: 5 });
  const boxW = (CONTENT_W - 6) / 2;
  const boxH = 48;
  const boxes: [string, string, string | undefined][] = [
    ['Le locataire', inspection.parties.tenant.name, inspection.signatures.tenant],
    ['Le bailleur ou son mandataire', inspection.parties.landlord, inspection.signatures.landlord],
  ];
  w.ensure(boxH + 12);
  boxes.forEach(([role, name, signature], i) => {
    const x = MARGIN + i * (boxW + 6);
    w.pdf.setDrawColor(...LINE);
    w.pdf.setLineWidth(0.3);
    w.pdf.roundedRect(x, w.y, boxW, boxH, 1.5, 1.5, 'S');
    w.font(8, 'bold', MUTED);
    w.pdf.text(clean(role.toUpperCase()), x + 4, w.y + 6);
    w.font(9.5, 'bold', INK);
    w.pdf.text(clean(name || '-'), x + 4, w.y + 11.5);
    if (signature) {
      w.pdf.addImage(signature, 'PNG', x + 4, w.y + 15, boxW - 8, boxH - 19, undefined, 'FAST');
    } else {
      w.font(8, 'normal', MUTED);
      w.pdf.text('Signature :', x + 4, w.y + 20);
    }
  });
  w.y += boxH + 6;
}

export async function generatePdf(inspection: Inspection, onProgress: (done: number, total: number) => void): Promise<Blob> {
  const total = allPhotoIds(inspection).length;
  let done = 0;
  const onPhoto = () => {
    done += 1;
    onProgress(Math.min(done, total), total);
  };
  onProgress(0, total);
  const w = new PdfWriter(inspection);

  await writeCover(w, inspection, onPhoto);

  w.newPage();
  w.heading('Clés');
  if (inspection.keys.length === 0) w.paragraph('Aucune clé remise.', { color: MUTED });
  else w.table(['Désignation', 'Type', 'Description', 'Quantité'], [62, 30, 68, 20], inspection.keys.map((k) => [k.label, k.type, k.description, String(k.quantity)]));
  for (const key of inspection.keys.filter((k) => k.photoIds.length)) {
    w.paragraph(key.label, { size: 8, style: 'bold', color: MUTED, gap: 1 });
    await w.photoGrid(key.photoIds, 4, onPhoto);
  }

  w.y += 4;
  w.heading('Compteurs');
  const isExit = inspection.type === 'sortie';
  if (inspection.meters.length === 0) w.paragraph('Aucun compteur relevé.', { color: MUTED });
  else if (isExit) {
    w.table(['Compteur', 'Référence', 'Entrée', 'Sortie', 'Date', 'Emplacement'], [40, 35, 25, 25, 22, 33], inspection.meters.map((m) => [m.label, m.reference, m.entryReading ?? '', m.reading, formatDate(m.readingDate), m.location]));
  } else {
    w.table(['Compteur', 'Référence', 'Fournisseur', 'Relevé', 'Date', 'Emplacement'], [38, 34, 34, 24, 22, 28], inspection.meters.map((m) => [m.label, m.reference, m.provider, m.reading, formatDate(m.readingDate), m.location]));
  }
  for (const meter of inspection.meters.filter((m) => m.photoIds.length)) {
    w.paragraph(meter.label, { size: 8, style: 'bold', color: MUTED, gap: 1 });
    await w.photoGrid(meter.photoIds, 4, onPhoto);
  }

  w.newPage();
  w.heading('Pièces');
  await writeRooms(w, inspection, onPhoto);
  await writeSignatures(w, inspection);
  w.decorate();
  onProgress(total, total);
  return w.pdf.output('blob');
}
