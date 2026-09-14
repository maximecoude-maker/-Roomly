import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Inspection, PhotoRecord, PhotoTarget } from './types';
import { deletePhotos, getInspection, saveInspection } from './lib/db';
import { importFiles } from './lib/photos';
import { removePhotoEverywhere, targetPhotoIds } from './lib/tree';

export type SaveState = 'saved' | 'saving' | 'error';

interface InspectionContextValue {
  inspection: Inspection;
  saveState: SaveState;
  update: (mutate: (draft: Inspection) => void) => void;
  addPhotos: (target: PhotoTarget, files: FileList | File[], source: PhotoRecord['source']) => Promise<string[]>;
  deletePhoto: (photoId: string) => Promise<void>;
  deletePhotoIds: (photoIds: string[]) => Promise<void>;
  movePhoto: (photoId: string, to: PhotoTarget) => void;
  flush: () => Promise<void>;
}

const InspectionContext = createContext<InspectionContextValue | null>(null);

const SAVE_DELAY = 400;

export function InspectionProvider({ id, children, fallback }: { id: string; children: ReactNode; fallback: (state: 'loading' | 'missing') => ReactNode }) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'missing' | 'ready'>('loading');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const latest = useRef<Inspection | null>(null);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    getInspection(id)
      .then((found) => {
        if (cancelled) return;
        latest.current = found ?? null;
        setInspection(found ?? null);
        setLoadState(found ? 'ready' : 'missing');
      })
      .catch((error: unknown) => {
        console.error('Chargement impossible', error);
        if (!cancelled) setLoadState('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const persist = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current || !latest.current) return;
    dirty.current = false;
    try {
      await saveInspection(latest.current);
      if (!dirty.current) setSaveState('saved');
    } catch (error) {
      console.error('Sauvegarde impossible', error);
      dirty.current = true;
      setSaveState('error');
    }
  }, []);

  const update = useCallback(
    (mutate: (draft: Inspection) => void) => {
      if (!latest.current) return;
      const next = structuredClone(latest.current);
      mutate(next);
      next.updatedAt = new Date().toISOString();
      latest.current = next;
      dirty.current = true;
      setInspection(next);
      setSaveState('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void persist(), SAVE_DELAY);
    },
    [persist],
  );

  // Recharge l'etat des lieux ouvert s'il a ete modifie depuis un autre appareil (hors saisie en cours).
  useEffect(() => {
    const onRemote = (event: Event) => {
      const ids = (event as CustomEvent<string[]>).detail;
      if (!ids.includes(id) || dirty.current) return;
      getInspection(id)
        .then((found) => {
          if (!found || dirty.current) return;
          latest.current = found;
          setInspection(found);
        })
        .catch((error: unknown) => console.error('Rechargement impossible', error));
    };
    window.addEventListener('app:remote-change', onRemote);
    return () => window.removeEventListener('app:remote-change', onRemote);
  }, [id]);

  // Sauvegarde immediate si l'onglet passe en arriere-plan (verrouillage du telephone, changement d'app).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void persist();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void persist();
    };
  }, [persist]);

  const addPhotos = useCallback(
    async (target: PhotoTarget, files: FileList | File[], source: PhotoRecord['source']) => {
      if (!latest.current) return [];
      const { ids, errors } = await importFiles(files, latest.current.id, source);
      if (errors.length > 0) window.dispatchEvent(new CustomEvent('app:toast', { detail: `Import impossible — ${errors.join(' ; ')}` }));
      if (ids.length === 0) return ids;
      update((draft) => {
        if (target.kind === 'cover') {
          draft.property.coverPhotoId = ids[0];
          return;
        }
        targetPhotoIds(draft, target)?.push(...ids);
      });
      return ids;
    },
    [update],
  );

  const deletePhotoIds = useCallback(
    async (photoIds: string[]) => {
      update((draft) => photoIds.forEach((photoId) => removePhotoEverywhere(draft, photoId)));
      await persist();
      await deletePhotos(photoIds);
    },
    [update, persist],
  );

  const deletePhoto = useCallback((photoId: string) => deletePhotoIds([photoId]), [deletePhotoIds]);

  const movePhoto = useCallback(
    (photoId: string, to: PhotoTarget) => {
      update((draft) => {
        removePhotoEverywhere(draft, photoId);
        if (to.kind === 'cover') draft.property.coverPhotoId = photoId;
        else targetPhotoIds(draft, to)?.push(photoId);
      });
    },
    [update],
  );

  if (loadState !== 'ready' || !inspection) return <>{fallback(loadState === 'ready' ? 'missing' : loadState)}</>;

  return (
    <InspectionContext.Provider value={{ inspection, saveState, update, addPhotos, deletePhoto, deletePhotoIds, movePhoto, flush: persist }}>
      {children}
    </InspectionContext.Provider>
  );
}

export function useInspection(): InspectionContextValue {
  const value = useContext(InspectionContext);
  if (!value) throw new Error('useInspection doit être utilisé dans InspectionProvider');
  return value;
}

export function useOptionalInspection(): InspectionContextValue | null {
  return useContext(InspectionContext);
}
