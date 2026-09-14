import type { Item } from '../types';
import { COMMENT_SUGGESTIONS, conditionLabel, isDegraded } from '../lib/format';
import { newItem } from '../lib/factory';
import { uid } from '../lib/ids';
import { navigate } from '../lib/router';
import { findItem, flatItems, itemPhotoIds } from '../lib/tree';
import { useInspection } from '../store';
import { ActionMenu, BottomBar, Button, EmptyState, Icon, TopBar, confirmDialog, promptDialog } from '../components/ui';
import { ConditionBadge, ConditionPicker, IssuesEditor, KeyValueEditor } from '../components/fields';
import { PhotoField } from '../components/Photos';

export function ItemScreen({ roomId, itemId }: { roomId: string; itemId: string }) {
  const { inspection, update, saveState, deletePhotoIds } = useInspection();
  const base = `/i/${inspection.id}`;
  const found = findItem(inspection, roomId, itemId);

  if (!found) {
    return (
      <div className="screen">
        <TopBar title="Élément introuvable" back={`${base}/r/${roomId}`} />
        <main className="content">
          <EmptyState icon="alert" title="Cet élément n’existe plus" />
        </main>
      </div>
    );
  }

  const { room, section, item } = found;
  const flat = flatItems(inspection);
  const position = flat.findIndex((f) => f.item.id === itemId);
  const prev = flat[position - 1];
  const next = flat[position + 1];
  const target = { kind: 'item' as const, roomId, sectionId: section.id, itemId };

  const mutate = (fn: (i: Item) => void) =>
    update((d) => {
      const f = findItem(d, roomId, itemId);
      if (f) fn(f.item);
    });

  const appendComment = (text: string) => mutate((i) => (i.comment = i.comment ? `${i.comment.replace(/[\s,.]+$/, '')}, ${text.toLowerCase()}` : text));

  const rename = async () => {
    const name = await promptDialog({ title: 'Renommer l’élément', initial: item.name, confirmLabel: 'Renommer' });
    if (name) mutate((i) => (i.name = name));
  };

  const duplicate = async () => {
    const name = await promptDialog({ title: 'Dupliquer l’élément', initial: `${item.name} 2`, confirmLabel: 'Dupliquer' });
    if (!name) return;
    const copy: Item = { ...newItem(name), characteristics: item.characteristics.map((c) => ({ ...c, id: uid() })), parts: item.parts.map((p) => ({ ...p, id: uid() })) };
    update((d) => {
      const f = findItem(d, roomId, itemId);
      if (!f) return;
      f.section.items.splice(f.section.items.indexOf(f.item) + 1, 0, copy);
    });
    navigate(`${base}/r/${roomId}/e/${copy.id}`, true);
  };

  const remove = async () => {
    const ok = await confirmDialog({ title: `Supprimer « ${item.name} » ?`, message: 'L’élément et ses photos seront supprimés.', confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    const photos = itemPhotoIds(item);
    update((d) => {
      const f = findItem(d, roomId, itemId);
      if (f) f.section.items = f.section.items.filter((i) => i.id !== itemId);
    });
    await deletePhotoIds(photos);
    navigate(`${base}/r/${roomId}`, true);
  };

  const goTo = (f: (typeof flat)[number] | undefined) => {
    if (!f) navigate(`${base}/recap`);
    else navigate(`${base}/r/${f.room.id}/e/${f.item.id}`, true);
  };

  const hasDetails = item.characteristics.length > 0 || item.parts.length > 0;

  return (
    <div className="screen">
      <TopBar
        title={item.name}
        subtitle={`${room.name} · ${section.name}`}
        saveState={saveState}
        back={`${base}/r/${roomId}`}
        right={
          <ActionMenu
            title={item.name}
            actions={[
              { label: 'Renommer', icon: 'edit', onSelect: () => void rename() },
              { label: 'Dupliquer', icon: 'copy', onSelect: () => void duplicate() },
              { label: 'Supprimer l’élément', icon: 'trash', danger: true, onSelect: () => void remove() },
            ]}
          />
        }
      />
      <div className="stepper-bar">
        <span>
          Élément {position + 1} / {flat.length}
        </span>
        {next && next.room.id !== roomId && <span className="muted">Pièce suivante : {next.room.name}</span>}
      </div>

      <main className="content stack-lg" key={item.id}>
        {item.entry && (
          <section className={`card card--pad stack entry-card ${isDegraded(item) ? 'is-degraded' : ''}`}>
            <div className="row row--between">
              <h2 className="card__title">À l’entrée</h2>
              <ConditionBadge value={item.entry.condition} />
            </div>
            {item.entry.comment && <p className="small">{item.entry.comment}</p>}
            {item.entry.issues.map((issue) => (
              <p key={issue.id} className="small is-warn">
                <Icon name="alert" size={14} /> {issue.type} : {issue.comment}
              </p>
            ))}
            {item.entry.photoIds.length > 0 && <PhotoField target={target} ids={item.entry.photoIds} readOnly compact />}
            {item.entry.condition && item.condition !== item.entry.condition && (
              <Button variant="secondary" icon="copy" onClick={() => mutate((i) => (i.condition = i.entry?.condition ?? null))}>
                Identique à l’entrée ({conditionLabel(item.entry.condition)})
              </Button>
            )}
            {isDegraded(item) && (
              <p className="notice notice--warn">
                <Icon name="alert" size={16} /> Dégradation par rapport à l’entrée
              </p>
            )}
          </section>
        )}

        <section className="stack-sm">
          <h2 className="section-title">{item.entry ? 'État à la sortie' : 'État'}</h2>
          <ConditionPicker value={item.condition} onChange={(condition) => mutate((i) => (i.condition = condition))} />
        </section>

        <section className="stack-sm">
          <h2 className="section-title">Photos {item.photoIds.length > 0 && <span className="count">{item.photoIds.length}</span>}</h2>
          <PhotoField target={target} ids={item.photoIds} />
        </section>

        <section className="stack-sm">
          <h2 className="section-title">Commentaire</h2>
          <textarea className="textarea" rows={3} placeholder="Observations, localisation d’un défaut…" value={item.comment} onChange={(e) => mutate((i) => (i.comment = e.target.value))} />
          <div className="chips chips--scroll">
            {COMMENT_SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip chip--add" onClick={() => appendComment(s)}>
                + {s}
              </button>
            ))}
          </div>
        </section>

        <section className="stack-sm">
          <h2 className="section-title">Constats {item.issues.length > 0 && <span className="count is-warn">{item.issues.length}</span>}</h2>
          <IssuesEditor issues={item.issues} onChange={(issues) => mutate((i) => (i.issues = issues))} />
        </section>

        <details className="card card--pad disclosure" open={hasDetails}>
          <summary className="disclosure__summary">
            <span className="card__title">Détails</span>
            <span className="muted small">{hasDetails ? `${item.characteristics.length + item.parts.length} information(s)` : 'Caractéristiques, parties…'}</span>
          </summary>
          <div className="stack disclosure__body">
            <span className="field__label">Caractéristiques</span>
            <KeyValueEditor rows={item.characteristics} onChange={(rows) => mutate((i) => (i.characteristics = rows))} addLabel="Ajouter une caractéristique" labelPlaceholder="Ex : marque" />
            <span className="field__label">Parties</span>
            <KeyValueEditor rows={item.parts} onChange={(rows) => mutate((i) => (i.parts = rows))} addLabel="Ajouter une partie" labelPlaceholder="Ex : serrure" />
          </div>
        </details>
      </main>

      <BottomBar>
        <Button variant="secondary" size="lg" icon="back" disabled={!prev} onClick={() => goTo(prev)} aria-label="Élément précédent" />
        <Button variant="primary" size="lg" block onClick={() => goTo(next)}>
          {next ? (next.room.id !== roomId ? `Suivant · ${next.room.name}` : `Suivant · ${next.item.name}`) : 'Terminer · Récapitulatif'}
        </Button>
      </BottomBar>
    </div>
  );
}
