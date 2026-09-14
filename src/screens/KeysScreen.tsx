import type { KeyEntry } from '../types';
import { uid } from '../lib/ids';
import { useInspection } from '../store';
import { BottomBar, Button, EmptyState, Field, IconButton, TopBar, confirmDialog } from '../components/ui';
import { ChoiceChips } from '../components/fields';
import { PhotoField } from '../components/Photos';

const KEY_TYPES = ['Clé', 'Badge', 'Bip', 'Carte'];

export function KeysScreen() {
  const { inspection, update, saveState, deletePhotoIds } = useInspection();

  const patch = (id: string, changes: Partial<KeyEntry>) =>
    update((d) => {
      const key = d.keys.find((k) => k.id === id);
      if (key) Object.assign(key, changes);
    });

  const remove = async (key: KeyEntry) => {
    const ok = await confirmDialog({ title: `Supprimer « ${key.label || 'ce jeu de clés'} » ?`, confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    const photos = key.photoIds;
    update((d) => (d.keys = d.keys.filter((k) => k.id !== key.id)));
    await deletePhotoIds(photos);
  };

  const add = () => update((d) => d.keys.push({ id: uid(), label: '', type: 'Clé', description: '', quantity: 1, photoIds: [] }));

  return (
    <div className="screen">
      <TopBar title="Clés" saveState={saveState} back={`/i/${inspection.id}`} />
      <main className="content stack-lg">
        {inspection.keys.length === 0 && <EmptyState icon="key" title="Aucune clé renseignée" />}
        {inspection.keys.map((key) => (
          <section key={key.id} className="card card--pad stack">
            <div className="row row--between">
              <input className="input input--title" value={key.label} placeholder="Désignation (ex : Porte d’entrée)" onChange={(e) => patch(key.id, { label: e.target.value })} />
              <IconButton icon="trash" label="Supprimer" onClick={() => void remove(key)} />
            </div>
            <ChoiceChips options={KEY_TYPES} value={key.type} onChange={(type) => patch(key.id, { type })} />
            <div className="grid-2">
              <Field label="Description">
                <input className="input" value={key.description} placeholder="Couleur, n°…" onChange={(e) => patch(key.id, { description: e.target.value })} />
              </Field>
              <div className="field">
                <span className="field__label">Quantité</span>
                <div className="stepper">
                  <IconButton icon="down" label="Retirer une clé" onClick={() => patch(key.id, { quantity: Math.max(0, key.quantity - 1) })} />
                  <span className="stepper__value">{key.quantity}</span>
                  <IconButton icon="up" label="Ajouter une clé" onClick={() => patch(key.id, { quantity: key.quantity + 1 })} />
                </div>
              </div>
            </div>
            <PhotoField target={{ kind: 'key', keyId: key.id }} ids={key.photoIds} compact />
          </section>
        ))}
      </main>
      <BottomBar>
        <Button variant="primary" size="lg" icon="plus" block onClick={add}>
          Ajouter un jeu de clés
        </Button>
      </BottomBar>
    </div>
  );
}
