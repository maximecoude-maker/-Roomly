import type { Meter, MeterKind } from '../types';
import { uid } from '../lib/ids';
import { todayIso } from '../lib/format';
import { useInspection } from '../store';
import { BottomBar, Button, EmptyState, Field, IconButton, TopBar, confirmDialog } from '../components/ui';
import { PhotoField } from '../components/Photos';

const KINDS: { value: MeterKind; label: string }[] = [
  { value: 'electricite', label: 'Électricité' },
  { value: 'eau', label: 'Eau' },
  { value: 'gaz', label: 'Gaz' },
  { value: 'autre', label: 'Autre' },
];

export function MetersScreen() {
  const { inspection, update, saveState, deletePhotoIds } = useInspection();

  const patch = (id: string, changes: Partial<Meter>) =>
    update((d) => {
      const meter = d.meters.find((m) => m.id === id);
      if (meter) Object.assign(meter, changes);
    });

  const remove = async (meter: Meter) => {
    const ok = await confirmDialog({ title: `Supprimer « ${meter.label} » ?`, confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    update((d) => (d.meters = d.meters.filter((m) => m.id !== meter.id)));
    await deletePhotoIds(meter.photoIds);
  };

  const add = () => update((d) => d.meters.push({ id: uid(), kind: 'autre', label: 'Compteur', reference: '', provider: '', reading: '', readingDate: todayIso(), location: '', photoIds: [] }));

  return (
    <div className="screen">
      <TopBar title="Compteurs" saveState={saveState} back={`/i/${inspection.id}`} />
      <main className="content stack-lg">
        {inspection.meters.length === 0 && <EmptyState icon="meter" title="Aucun compteur renseigné" />}
        {inspection.meters.map((meter) => (
          <section key={meter.id} className="card card--pad stack">
            <div className="row row--between">
              <input className="input input--title" value={meter.label} onChange={(e) => patch(meter.id, { label: e.target.value })} />
              <IconButton icon="trash" label="Supprimer" onClick={() => void remove(meter)} />
            </div>
            <div className="chips">
              {KINDS.map((k) => (
                <button key={k.value} type="button" className={`chip ${meter.kind === k.value ? 'is-active' : ''}`} onClick={() => patch(meter.id, { kind: k.value })}>
                  {k.label}
                </button>
              ))}
            </div>
            <div className="grid-2">
              <Field label={meter.entryReading !== undefined ? 'Relevé de sortie' : 'Relevé'} hint={meter.entryReading ? `À l’entrée : ${meter.entryReading}` : undefined}>
                <input className="input input--big" inputMode="decimal" value={meter.reading} placeholder="Index" onChange={(e) => patch(meter.id, { reading: e.target.value })} />
              </Field>
              <Field label="Date du relevé">
                <input className="input" type="date" value={meter.readingDate} onChange={(e) => patch(meter.id, { readingDate: e.target.value })} />
              </Field>
            </div>
            <div className="grid-2">
              <Field label="Référence / n° PDL">
                <input className="input" value={meter.reference} onChange={(e) => patch(meter.id, { reference: e.target.value })} />
              </Field>
              <Field label="Fournisseur">
                <input className="input" value={meter.provider} onChange={(e) => patch(meter.id, { provider: e.target.value })} />
              </Field>
            </div>
            <Field label="Emplacement">
              <input className="input" value={meter.location} placeholder="Ex : Cuisine, placard" onChange={(e) => patch(meter.id, { location: e.target.value })} />
            </Field>
            <PhotoField target={{ kind: 'meter', meterId: meter.id }} ids={meter.photoIds} compact />
          </section>
        ))}
      </main>
      <BottomBar>
        <Button variant="primary" size="lg" icon="plus" block onClick={add}>
          Ajouter un compteur
        </Button>
      </BottomBar>
    </div>
  );
}
