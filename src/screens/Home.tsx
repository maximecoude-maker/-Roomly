import { useEffect, useRef, useState } from 'react';
import type { Inspection } from '../types';
import { downloadBlob, exportBackup, importBackup } from '../lib/backup';
import { deleteInspection, listInspections } from '../lib/db';
import { formatDate, fullAddress, inspectionProgress, titleFor } from '../lib/format';
import { navigate } from '../lib/router';
import { ActionMenu, BottomBar, Button, EmptyState, Icon, ProgressBar, confirmDialog, toast } from '../components/ui';
import { Thumb } from '../components/Photos';

export function Home() {
  const [items, setItems] = useState<Inspection[] | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    listInspections()
      .then(setItems)
      .catch((error: unknown) => {
        console.error(error);
        toast('Impossible de lire les données locales');
        setItems([]);
      });

  useEffect(() => {
    void refresh();
  }, []);

  const onDelete = async (inspection: Inspection) => {
    const ok = await confirmDialog({
      title: 'Supprimer cet état des lieux ?',
      message: `${titleFor(inspection)} — ${fullAddress(inspection) || 'sans adresse'}. Toutes ses photos seront supprimées. Action irréversible.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    await deleteInspection(inspection.id);
    toast('État des lieux supprimé');
    void refresh();
  };

  const onExport = async (inspection: Inspection) => {
    const blob = await exportBackup(inspection);
    downloadBlob(blob, `sauvegarde-edl-${inspection.type}-${inspection.dates.inspectionDate}.json`);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const inspection = await importBackup(file);
      toast('Sauvegarde importée');
      navigate(`/i/${inspection.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import impossible');
    }
  };

  return (
    <div className="screen">
      <header className="hero">
        <div className="hero__brand">
          <span className="hero__logo">
            <Icon name="home" size={20} />
          </span>
          État des lieux
        </div>
        <h1 className="hero__title">Vos états des lieux</h1>
        <p className="hero__sub">Saisie pièce par pièce, photos, signatures et PDF final. Tout est enregistré automatiquement sur cet appareil.</p>
      </header>

      <main className="content">
        {items === null ? null : items.length === 0 ? (
          <EmptyState icon="file" title="Aucun état des lieux">
            <p className="muted">Créez votre premier état des lieux à partir du modèle importé depuis le PDF.</p>
          </EmptyState>
        ) : (
          <div className="stack">
            {items.map((inspection) => {
              const progress = inspectionProgress(inspection);
              return (
                <article key={inspection.id} className="card card--link" onClick={() => navigate(`/i/${inspection.id}`)}>
                  <div className="insp-card">
                    {inspection.property.coverPhotoId ? <Thumb id={inspection.property.coverPhotoId} size="sm" /> : <span className="thumb thumb--sm thumb--icon"><Icon name="home" /></span>}
                    <div className="insp-card__main">
                      <div className="row row--wrap">
                        <span className={`badge badge--type is-${inspection.type}`}>{inspection.type === 'entree' ? 'Entrée' : 'Sortie'}</span>
                        <span className={`badge ${inspection.status === 'validated' ? 'badge--ok' : 'badge--muted'}`}>{inspection.status === 'validated' ? 'Validé' : 'Brouillon'}</span>
                      </div>
                      <h2 className="insp-card__title">{fullAddress(inspection) || 'Adresse à compléter'}</h2>
                      <p className="muted small">
                        {formatDate(inspection.dates.inspectionDate)} · {inspection.parties.tenant.name || 'Locataire à compléter'}
                      </p>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        title={fullAddress(inspection)}
                        actions={[
                          { label: 'Ouvrir', icon: 'edit', onSelect: () => navigate(`/i/${inspection.id}`) },
                          { label: 'Exporter une sauvegarde (.json)', icon: 'download', onSelect: () => void onExport(inspection) },
                          { label: 'Supprimer', icon: 'trash', danger: true, onSelect: () => void onDelete(inspection) },
                        ]}
                      />
                    </div>
                  </div>
                  <div className="insp-card__progress">
                    <ProgressBar value={progress.done} total={progress.total} />
                    <span className="small muted">
                      {progress.done}/{progress.total} éléments · {progress.photos} photos
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="center-actions">
          <Button variant="ghost" icon="upload" onClick={() => importRef.current?.click()}>
            Importer une sauvegarde
          </Button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onImport(e.target.files?.[0])} />
        </div>
      </main>

      <BottomBar>
        <Button variant="primary" size="lg" icon="plus" block onClick={() => navigate('/new')}>
          Nouvel état des lieux
        </Button>
      </BottomBar>
    </div>
  );
}
