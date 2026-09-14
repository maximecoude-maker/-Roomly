import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { PhotoTarget } from '../types';
import { photoUrl, photoVersion, replacePhotoContent } from '../lib/photos';
import { targetLabel } from '../lib/tree';
import { useInspection } from '../store';
import { Button, Icon, IconButton, Sheet, confirmDialog, toast } from './ui';

export function Thumb({ id, onClick, size = 'md' }: { id: string; onClick?: () => void; size?: 'sm' | 'md' }) {
  const [url, setUrl] = useState<string | null>(null);
  const version = photoVersion.get(id) ?? 0;
  useEffect(() => {
    let alive = true;
    photoUrl(id, 'thumb')
      .then((u) => alive && setUrl(u))
      .catch((error: unknown) => console.error('Vignette indisponible', error));
    return () => {
      alive = false;
    };
  }, [id, version]);
  return (
    <button type="button" className={`thumb thumb--${size}`} onClick={onClick} aria-label="Voir la photo">
      {url ? <img src={url} alt="" loading="lazy" draggable={false} /> : <span className="thumb__placeholder" />}
    </button>
  );
}

interface PhotoFieldProps {
  target: PhotoTarget;
  ids: string[];
  readOnly?: boolean;
  compact?: boolean;
}

/** Galerie de photos d'une cible + ajout immediat (appareil photo, galerie, fichier, glisser-deposer). */
export function PhotoField({ target, ids, readOnly, compact }: PhotoFieldProps) {
  const { addPhotos } = useInspection();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | File[] | null, source: 'camera' | 'import') => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (list.length === 0) {
      toast('Seules les images sont acceptées');
      return;
    }
    setPending((n) => n + list.length);
    try {
      const added = await addPhotos(target, list, source);
      if (added.length > 0) toast(added.length === 1 ? 'Photo ajoutée' : `${added.length} photos ajoutées`);
    } finally {
      setPending((n) => n - list.length);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (!readOnly) void handleFiles(event.dataTransfer.files, 'import');
  };

  return (
    <div
      className={`photos ${dragOver ? 'is-over' : ''} ${compact ? 'photos--compact' : ''}`}
      onDragOver={(e) => {
        if (readOnly) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {(ids.length > 0 || pending > 0) && (
        <div className="photos__grid">
          {ids.map((id, index) => (
            <Thumb key={id} id={id} onClick={() => setViewerIndex(index)} />
          ))}
          {Array.from({ length: pending }).map((_, i) => (
            <span key={`p${i}`} className="thumb thumb--loading" aria-label="Import en cours" />
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="photo-actions">
          <Button variant="primary" icon="camera" size={compact ? 'md' : 'lg'} onClick={() => cameraRef.current?.click()}>
            Photo
          </Button>
          <Button variant="secondary" icon="image" size={compact ? 'md' : 'lg'} onClick={() => galleryRef.current?.click()}>
            Galerie / fichier
          </Button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void handleFiles(e.target.files, 'camera');
              e.target.value = '';
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            hidden
            onChange={(e) => {
              void handleFiles(e.target.files, 'import');
              e.target.value = '';
            }}
          />
        </div>
      )}
      {viewerIndex !== null && ids.length > 0 && (
        <PhotoViewer ids={ids} startIndex={Math.min(viewerIndex, ids.length - 1)} target={target} readOnly={readOnly} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  );
}

function FullImage({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const version = photoVersion.get(id) ?? 0;
  useEffect(() => {
    let alive = true;
    setUrl(null);
    photoUrl(id, 'full')
      .then((u) => alive && setUrl(u))
      .catch((error: unknown) => console.error('Photo indisponible', error));
    return () => {
      alive = false;
    };
  }, [id, version]);
  return url ? <img className="viewer__img" src={url} alt="" /> : <div className="viewer__loading">Chargement…</div>;
}

export function PhotoViewer({ ids, startIndex, target, readOnly, onClose }: { ids: string[]; startIndex: number; target: PhotoTarget; readOnly?: boolean; onClose: () => void }) {
  const { inspection, update, deletePhoto, movePhoto } = useInspection();
  const [index, setIndex] = useState(startIndex);
  const [picking, setPicking] = useState(false);
  const [, forceRender] = useState(0);
  const replaceRef = useRef<HTMLInputElement>(null);
  const touchX = useRef<number | null>(null);
  const safeIndex = Math.min(index, ids.length - 1);
  const id = ids[safeIndex];

  useEffect(() => {
    if (ids.length === 0) onClose();
  }, [ids.length, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, ids.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [ids.length, onClose]);

  if (!id) return null;
  const isCover = inspection.property.coverPhotoId === id;

  const onDelete = async () => {
    const ok = await confirmDialog({ title: 'Supprimer cette photo ?', message: 'La photo sera définitivement retirée de l’état des lieux.', confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    await deletePhoto(id);
    toast('Photo supprimée');
  };

  const onReplace = async (file: File | undefined) => {
    if (!file) return;
    try {
      await replacePhotoContent(id, file);
      update(() => undefined);
      forceRender((n) => n + 1);
      toast('Photo remplacée');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Remplacement impossible');
    }
  };

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Photo">
      <div className="viewer__top">
        <IconButton icon="close" label="Fermer" onClick={onClose} />
        <div className="viewer__title">
          <span>{targetLabel(inspection, target)}</span>
          <small>
            {safeIndex + 1} / {ids.length}
          </small>
        </div>
        <span className="topbar__spacer" />
      </div>
      <div
        className="viewer__stage"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const delta = e.changedTouches[0].clientX - touchX.current;
          if (delta < -50) setIndex(Math.min(safeIndex + 1, ids.length - 1));
          if (delta > 50) setIndex(Math.max(safeIndex - 1, 0));
          touchX.current = null;
        }}
      >
        <FullImage id={id} />
        {safeIndex > 0 && <IconButton icon="back" label="Précédente" className="viewer__nav viewer__nav--prev" onClick={() => setIndex(safeIndex - 1)} />}
        {safeIndex < ids.length - 1 && <IconButton icon="chevron" label="Suivante" className="viewer__nav viewer__nav--next" onClick={() => setIndex(safeIndex + 1)} />}
      </div>
      {!readOnly && (
        <div className="viewer__actions">
          <button type="button" onClick={() => replaceRef.current?.click()}>
            <Icon name="replace" />
            Remplacer
          </button>
          <button type="button" onClick={() => setPicking(true)}>
            <Icon name="move" />
            Déplacer
          </button>
          <button type="button" className={isCover ? 'is-active' : ''} onClick={() => update((d) => (d.property.coverPhotoId = id))}>
            <Icon name="star" />
            {isCover ? 'Couverture' : 'En couverture'}
          </button>
          <button type="button" className="is-danger" onClick={() => void onDelete()}>
            <Icon name="trash" />
            Supprimer
          </button>
          <input
            ref={replaceRef}
            type="file"
            accept="image/*,.heic,.heif"
            hidden
            onChange={(e) => {
              void onReplace(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}
      <TargetPicker
        open={picking}
        current={target}
        onClose={() => setPicking(false)}
        onPick={(to) => {
          movePhoto(id, to);
          setPicking(false);
          toast(`Photo déplacée vers « ${targetLabel(inspection, to)} »`);
        }}
      />
    </div>
  );
}

function TargetPicker({ open, current, onClose, onPick }: { open: boolean; current: PhotoTarget; onClose: () => void; onPick: (target: PhotoTarget) => void }) {
  const { inspection } = useInspection();
  const [roomId, setRoomId] = useState<string | null>(null);
  const room = inspection.rooms.find((r) => r.id === roomId);
  const isCurrent = (t: PhotoTarget) => JSON.stringify(t) === JSON.stringify(current);

  const row = (label: string, t: PhotoTarget, meta?: string) => (
    <button key={JSON.stringify(t)} type="button" className="menu-item" disabled={isCurrent(t)} onClick={() => onPick(t)}>
      <span className="menu-item__text">
        {label}
        {meta && <small>{meta}</small>}
      </span>
      {isCurrent(t) && <Icon name="check" />}
    </button>
  );

  return (
    <Sheet
      open={open}
      onClose={() => {
        setRoomId(null);
        onClose();
      }}
      title={room ? room.name : 'Déplacer la photo vers…'}
    >
      <div className="menu-list">
        {room ? (
          <>
            <button type="button" className="menu-item menu-item--muted" onClick={() => setRoomId(null)}>
              <Icon name="back" />
              <span>Toutes les destinations</span>
            </button>
            {row('Vue générale de la pièce', { kind: 'room', roomId: room.id })}
            {room.sections.flatMap((section) => section.items.map((item) => row(item.name, { kind: 'item', roomId: room.id, sectionId: section.id, itemId: item.id }, section.name)))}
          </>
        ) : (
          <>
            {inspection.rooms.map((r) => (
              <button key={r.id} type="button" className="menu-item" onClick={() => setRoomId(r.id)}>
                <Icon name="home" />
                <span className="menu-item__text">{r.name}</span>
                <Icon name="chevron" />
              </button>
            ))}
            {inspection.keys.map((k) => row(`Clés · ${k.label}`, { kind: 'key', keyId: k.id }))}
            {inspection.meters.map((m) => row(m.label, { kind: 'meter', meterId: m.id }))}
          </>
        )}
      </div>
    </Sheet>
  );
}
