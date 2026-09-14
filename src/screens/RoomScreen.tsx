import { useState } from 'react';
import type { Condition, Room } from '../types';
import { defaultGeneralState, newItem, newSection, SECTION_PRESETS } from '../lib/factory';
import { CONDITIONS, GENERAL_STATE_OPTIONS, needsAttention, roomProgress } from '../lib/format';
import { uid } from '../lib/ids';
import { navigate } from '../lib/router';
import { findRoom, roomPhotoIds, sectionPhotoIds } from '../lib/tree';
import { useInspection } from '../store';
import { ActionMenu, BottomBar, Button, EmptyState, Icon, ProgressBar, Sheet, TopBar, confirmDialog, promptDialog, toast } from '../components/ui';
import { ChoiceChips, ConditionBadge } from '../components/fields';
import { PhotoField } from '../components/Photos';

export function RoomScreen({ roomId }: { roomId: string }) {
  const { inspection, update, saveState, deletePhotoIds } = useInspection();
  const [fillOpen, setFillOpen] = useState(false);
  const base = `/i/${inspection.id}`;
  const room = findRoom(inspection, roomId);

  if (!room) {
    return (
      <div className="screen">
        <TopBar title="Pièce introuvable" back={base} />
        <main className="content">
          <EmptyState icon="alert" title="Cette pièce n’existe plus" />
        </main>
      </div>
    );
  }

  const progress = roomProgress(room);
  const isExit = inspection.type === 'sortie';
  const mutateRoom = (fn: (r: Room) => void) =>
    update((d) => {
      const r = findRoom(d, roomId);
      if (r) fn(r);
    });

  const rename = async () => {
    const name = await promptDialog({ title: 'Renommer la pièce', initial: room.name, confirmLabel: 'Renommer' });
    if (name) mutateRoom((r) => (r.name = name));
  };

  const moveRoom = (delta: number) =>
    update((d) => {
      const index = d.rooms.findIndex((r) => r.id === roomId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= d.rooms.length) return;
      const [moved] = d.rooms.splice(index, 1);
      d.rooms.splice(target, 0, moved);
    });

  const duplicate = async () => {
    const name = await promptDialog({ title: 'Dupliquer la pièce (sans photos ni états)', initial: `${room.name} (copie)`, confirmLabel: 'Dupliquer' });
    if (!name) return;
    const copy: Room = {
      id: uid(),
      name,
      comment: '',
      photoIds: [],
      generalState: room.generalState.map((g) => ({ ...g, id: uid() })),
      sections: room.sections.map((s) => ({ id: uid(), name: s.name, items: s.items.map((i) => ({ ...newItem(i.name), characteristics: i.characteristics.map((c) => ({ ...c, id: uid() })), parts: i.parts.map((p) => ({ ...p, id: uid() })) })) })),
    };
    update((d) => d.rooms.splice(d.rooms.findIndex((r) => r.id === roomId) + 1, 0, copy));
    navigate(`${base}/r/${copy.id}`, true);
  };

  const removeRoom = async () => {
    const ok = await confirmDialog({ title: `Supprimer « ${room.name} » ?`, message: 'Tous les éléments et photos de la pièce seront supprimés.', confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    const photos = roomPhotoIds(room);
    update((d) => (d.rooms = d.rooms.filter((r) => r.id !== roomId)));
    await deletePhotoIds(photos);
    navigate(base, true);
  };

  const addSection = async () => {
    const name = await promptDialog({ title: 'Ajouter une rubrique', placeholder: 'Nom de la rubrique', confirmLabel: 'Ajouter', suggestions: SECTION_PRESETS });
    if (name) mutateRoom((r) => r.sections.push(newSection(name)));
  };

  const addItem = async (sectionId: string) => {
    const name = await promptDialog({ title: 'Ajouter un élément', placeholder: 'Ex : Radiateur, Placard…', confirmLabel: 'Ajouter' });
    if (!name) return;
    const item = newItem(name);
    mutateRoom((r) => r.sections.find((s) => s.id === sectionId)?.items.push(item));
    navigate(`${base}/r/${roomId}/e/${item.id}`);
  };

  const renameSection = async (sectionId: string, current: string) => {
    const name = await promptDialog({ title: 'Renommer la rubrique', initial: current, confirmLabel: 'Renommer', suggestions: SECTION_PRESETS });
    if (name) mutateRoom((r) => r.sections.forEach((s) => s.id === sectionId && (s.name = name)));
  };

  const removeSection = async (sectionId: string) => {
    const section = room.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const ok = await confirmDialog({ title: `Supprimer la rubrique « ${section.name} » ?`, message: `${section.items.length} élément(s) et leurs photos seront supprimés.`, confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    const photos = sectionPhotoIds(section);
    mutateRoom((r) => (r.sections = r.sections.filter((s) => s.id !== sectionId)));
    await deletePhotoIds(photos);
  };

  const fillRemaining = (condition: Condition | 'entry') => {
    let count = 0;
    mutateRoom((r) =>
      r.sections.forEach((s) =>
        s.items.forEach((i) => {
          if (i.condition) return;
          const next = condition === 'entry' ? i.entry?.condition ?? null : condition;
          if (next) {
            i.condition = next;
            count += 1;
          }
        }),
      ),
    );
    setFillOpen(false);
    toast(count > 0 ? 'Éléments restants renseignés' : 'Aucun élément modifié');
  };

  const missingChecks = Object.keys(GENERAL_STATE_OPTIONS).filter((label) => !room.generalState.some((g) => g.label === label));
  const firstTodo = room.sections.flatMap((s) => s.items).find((i) => !i.condition) ?? room.sections[0]?.items[0];

  return (
    <div className="screen">
      <TopBar
        title={room.name}
        subtitle={`${progress.done}/${progress.total} éléments`}
        saveState={saveState}
        back={base}
        right={
          <ActionMenu
            title={room.name}
            actions={[
              { label: 'Renommer', icon: 'edit', onSelect: () => void rename() },
              { label: 'Monter dans la liste', icon: 'up', onSelect: () => moveRoom(-1) },
              { label: 'Descendre dans la liste', icon: 'down', onSelect: () => moveRoom(1) },
              { label: 'Dupliquer la structure', icon: 'copy', onSelect: () => void duplicate() },
              { label: 'Supprimer la pièce', icon: 'trash', danger: true, onSelect: () => void removeRoom() },
            ]}
          />
        }
      />
      <div className="room-progress">
        <ProgressBar value={progress.done} total={progress.total} />
      </div>
      <main className="content stack-lg">
        <section className="card card--pad stack">
          <h2 className="card__title">Vue générale</h2>
          <PhotoField target={{ kind: 'room', roomId }} ids={room.photoIds} compact />
          <textarea className="textarea" rows={2} placeholder="Commentaire sur la pièce (optionnel)" value={room.comment} onChange={(e) => mutateRoom((r) => (r.comment = e.target.value))} />
        </section>

        <details className="card card--pad disclosure" open={room.generalState.length > 0 && inspection.type === 'entree' ? undefined : undefined}>
          <summary className="disclosure__summary">
            <span className="card__title">État général</span>
            <span className="muted small">{room.generalState.map((g) => g.value).join(' · ') || 'Non renseigné'}</span>
          </summary>
          <div className="stack disclosure__body">
            {room.generalState.map((check) => (
              <div key={check.id} className="check-row">
                <span className="field__label">{check.label}</span>
                <ChoiceChips options={GENERAL_STATE_OPTIONS[check.label] ?? [check.value]} value={check.value} onChange={(value) => mutateRoom((r) => r.generalState.forEach((g) => g.id === check.id && (g.value = value)))} />
              </div>
            ))}
            {room.generalState.length === 0 && (
              <Button variant="ghost" size="sm" icon="plus" onClick={() => mutateRoom((r) => (r.generalState = defaultGeneralState()))}>
                Ajouter les critères d’état général
              </Button>
            )}
            {room.generalState.length > 0 && missingChecks.length > 0 && (
              <div className="chips chips--wrap">
                {missingChecks.map((label) => (
                  <button key={label} type="button" className="chip chip--add" onClick={() => mutateRoom((r) => r.generalState.push({ id: uid(), label, value: GENERAL_STATE_OPTIONS[label][0] }))}>
                    + {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </details>

        {room.sections.map((section) => (
          <section key={section.id} className="stack-sm">
            <div className="row row--between section-head">
              <h2 className="section-title">{section.name}</h2>
              <ActionMenu
                title={section.name}
                actions={[
                  { label: 'Ajouter un élément', icon: 'plus', onSelect: () => void addItem(section.id) },
                  { label: 'Renommer la rubrique', icon: 'edit', onSelect: () => void renameSection(section.id, section.name) },
                  { label: 'Supprimer la rubrique', icon: 'trash', danger: true, onSelect: () => void removeSection(section.id) },
                ]}
              />
            </div>
            <div className="card list">
              {section.items.map((item) => (
                <button key={item.id} type="button" className="list-row" onClick={() => navigate(`${base}/r/${roomId}/e/${item.id}`)}>
                  <span className="list-row__main">
                    <span className="list-row__title">{item.name}</span>
                    <span className="list-row__meta">
                      {item.photoIds.length > 0 && (
                        <span className="meta-icon">
                          <Icon name="camera" size={14} /> {item.photoIds.length}
                        </span>
                      )}
                      {item.comment && <span className="truncate">{item.comment}</span>}
                      {needsAttention(item) && (
                        <span className="meta-icon is-warn">
                          <Icon name="alert" size={14} /> À signaler
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="badges">
                    {isExit && item.entry && <ConditionBadge value={item.entry.condition} prefix="E" />}
                    <ConditionBadge value={item.condition} />
                  </span>
                </button>
              ))}
              <button type="button" className="list-row list-row--add" onClick={() => void addItem(section.id)}>
                <Icon name="plus" size={18} /> Ajouter un élément
              </button>
            </div>
          </section>
        ))}

        <div className="center-actions">
          <Button variant="secondary" icon="plus" onClick={() => void addSection()}>
            Ajouter une rubrique
          </Button>
          {progress.done < progress.total && (
            <Button variant="ghost" icon="check" onClick={() => setFillOpen(true)}>
              Remplir les éléments restants
            </Button>
          )}
        </div>
      </main>

      <Sheet open={fillOpen} onClose={() => setFillOpen(false)} title={`Renseigner ${progress.total - progress.done} élément(s) restant(s)`}>
        <p className="dialog-message">Seuls les éléments non renseignés seront modifiés.</p>
        <div className="menu-list">
          {isExit && (
            <button type="button" className="menu-item" onClick={() => fillRemaining('entry')}>
              <Icon name="copy" />
              <span>Identique à l’entrée</span>
            </button>
          )}
          {CONDITIONS.slice(0, 3).map((c) => (
            <button key={c.value} type="button" className="menu-item" onClick={() => fillRemaining(c.value)}>
              <ConditionBadge value={c.value} />
              <span>Tout en « {c.label} »</span>
            </button>
          ))}
        </div>
      </Sheet>

      {firstTodo && (
        <BottomBar>
          <Button variant="primary" size="lg" block icon="edit" onClick={() => navigate(`${base}/r/${roomId}/e/${firstTodo.id}`)}>
            {progress.done === 0 ? 'Commencer la saisie' : progress.done < progress.total ? 'Continuer la saisie' : 'Revoir les éléments'}
          </Button>
        </BottomBar>
      )}
    </div>
  );
}
