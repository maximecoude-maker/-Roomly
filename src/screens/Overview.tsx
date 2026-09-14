import { downloadBlob, exportBackup } from '../lib/backup';
import { deleteInspection } from '../lib/db';
import { newRoom, ROOM_PRESETS } from '../lib/factory';
import { formatDate, fullAddress, inspectionProgress, roomProgress, titleFor } from '../lib/format';
import { navigate } from '../lib/router';
import { flatItems } from '../lib/tree';
import { useInspection } from '../store';
import { ActionMenu, BottomBar, Button, Icon, ProgressBar, TopBar, confirmDialog, promptDialog, toast, type IconName } from '../components/ui';
import { Thumb } from '../components/Photos';

function HubRow({ icon, title, meta, href, warn }: { icon: IconName; title: string; meta: string; href: string; warn?: boolean }) {
  return (
    <button type="button" className="list-row" onClick={() => navigate(href)}>
      <span className="list-row__icon">
        <Icon name={icon} />
      </span>
      <span className="list-row__main">
        <span className="list-row__title">{title}</span>
        <span className={`list-row__meta ${warn ? 'is-warn' : ''}`}>{meta}</span>
      </span>
      <Icon name="chevron" />
    </button>
  );
}

export function Overview() {
  const { inspection, update, saveState, flush } = useInspection();
  const base = `/i/${inspection.id}`;
  const progress = inspectionProgress(inspection);
  const firstTodo = flatItems(inspection).find((f) => !f.item.condition);
  const infoMissing = !inspection.property.address || !inspection.parties.tenant.name || !inspection.dates.inspectionDate;

  const addRoom = async () => {
    const name = await promptDialog({ title: 'Ajouter une pièce', placeholder: 'Nom de la pièce', confirmLabel: 'Ajouter', suggestions: ROOM_PRESETS });
    if (!name) return;
    const room = newRoom(name);
    update((d) => d.rooms.push(room));
    navigate(`${base}/r/${room.id}`);
  };

  const onDelete = async () => {
    const ok = await confirmDialog({ title: 'Supprimer cet état des lieux ?', message: 'Toutes les données et photos seront supprimées. Action irréversible.', confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    await flush();
    await deleteInspection(inspection.id);
    toast('État des lieux supprimé');
    navigate('/', true);
  };

  return (
    <div className="screen">
      <TopBar
        title={titleFor(inspection)}
        saveState={saveState}
        back="/"
        right={
          <ActionMenu
            actions={[
              { label: 'Exporter une sauvegarde (.json)', icon: 'download', onSelect: () => void exportBackup(inspection).then((b) => downloadBlob(b, `sauvegarde-edl-${inspection.type}-${inspection.dates.inspectionDate}.json`)) },
              { label: 'Supprimer l’état des lieux', icon: 'trash', danger: true, onSelect: () => void onDelete() },
            ]}
          />
        }
      />
      <main className="content">
        <section className="summary">
          {inspection.property.coverPhotoId && (
            <div className="summary__cover">
              <Thumb id={inspection.property.coverPhotoId} onClick={() => navigate(`${base}/info`)} />
            </div>
          )}
          <div className="summary__text">
            <span className={`badge badge--type is-${inspection.type}`}>{inspection.type === 'entree' ? 'Entrée' : 'Sortie'}</span>
            <h1 className="summary__title">{fullAddress(inspection) || 'Adresse à compléter'}</h1>
            <p className="muted small">
              {formatDate(inspection.dates.inspectionDate)} · {inspection.parties.tenant.name || 'Locataire à compléter'}
            </p>
          </div>
          <div className="summary__progress">
            <ProgressBar value={progress.done} total={progress.total} />
            <div className="row row--between small">
              <span>
                <strong>{progress.done}</strong>/{progress.total} éléments renseignés
              </span>
              <span className="muted">{progress.photos} photos</span>
            </div>
          </div>
          {inspection.status === 'validated' && (
            <div className="notice notice--ok">
              <Icon name="check" size={18} /> Validé le {formatDate(inspection.validatedAt)} — les modifications restent possibles.
            </div>
          )}
        </section>

        <div className="card list">
          <HubRow icon="info" title="Informations générales" meta={infoMissing ? 'À compléter : adresse, locataire ou date' : `${inspection.parties.landlord || 'Bailleur'} · ${inspection.parties.tenant.name}`} href={`${base}/info`} warn={infoMissing} />
          <HubRow icon="key" title="Clés" meta={`${inspection.keys.reduce((n, k) => n + (Number(k.quantity) || 0), 0)} clés · ${inspection.keys.length} jeux`} href={`${base}/keys`} />
          <HubRow icon="meter" title="Compteurs" meta={inspection.meters.map((m) => m.label.replace('Compteur d’', '').replace("Compteur d'", '')).join(' · ') || 'Aucun compteur'} href={`${base}/meters`} />
        </div>

        <div className="row row--between section-head">
          <h2 className="section-title">Pièces</h2>
          <Button variant="ghost" size="sm" icon="plus" onClick={() => void addRoom()}>
            Ajouter
          </Button>
        </div>
        <div className="card list">
          {inspection.rooms.map((room) => {
            const p = roomProgress(room);
            const complete = p.total > 0 && p.done === p.total;
            return (
              <button key={room.id} type="button" className="list-row" onClick={() => navigate(`${base}/r/${room.id}`)}>
                <span className={`ring ${complete ? 'is-done' : ''}`} style={{ ['--pct' as string]: `${p.total ? (p.done / p.total) * 100 : 0}` }}>
                  {complete ? <Icon name="check" size={16} /> : <span>{p.done}</span>}
                </span>
                <span className="list-row__main">
                  <span className="list-row__title">{room.name}</span>
                  <span className="list-row__meta">
                    {p.done}/{p.total} éléments · {p.photos} photos
                    {p.attention > 0 && <span className="is-warn"> · {p.attention} point{p.attention > 1 ? 's' : ''} d’attention</span>}
                  </span>
                </span>
                <Icon name="chevron" />
              </button>
            );
          })}
          {inspection.rooms.length === 0 && <p className="muted pad">Aucune pièce. Ajoutez-en une pour commencer.</p>}
        </div>
      </main>
      <BottomBar>
        {firstTodo && (
          <Button variant="secondary" size="lg" onClick={() => navigate(`${base}/r/${firstTodo.room.id}/e/${firstTodo.item.id}`)}>
            Reprendre
          </Button>
        )}
        <Button variant="primary" size="lg" icon="file" block onClick={() => navigate(`${base}/recap`)}>
          Récapitulatif
        </Button>
      </BottomBar>
    </div>
  );
}
