import { conditionLabel, formatDate, fullAddress, inspectionProgress, isDegraded, needsAttention, titleFor } from '../lib/format';
import { navigate } from '../lib/router';
import { flatItems } from '../lib/tree';
import { useInspection } from '../store';
import { BottomBar, Button, Field, Icon, TopBar, confirmDialog } from '../components/ui';
import { ConditionBadge, SignaturePad } from '../components/fields';

export function RecapScreen() {
  const { inspection, update, saveState, flush } = useInspection();
  const base = `/i/${inspection.id}`;
  const progress = inspectionProgress(inspection);
  const flat = flatItems(inspection);
  const todo = flat.filter((f) => !f.item.condition);
  const attention = flat.filter((f) => needsAttention(f.item));
  const missingInfo = [
    !inspection.property.address && 'adresse du logement',
    !inspection.parties.tenant.name && 'nom du locataire',
    !inspection.parties.landlord && 'bailleur',
    !inspection.dates.inspectionDate && 'date de l’état des lieux',
  ].filter(Boolean) as string[];
  const todoByRoom = inspection.rooms
    .map((room) => ({ room, items: todo.filter((t) => t.room.id === room.id) }))
    .filter((g) => g.items.length > 0);

  const validate = async () => {
    const blockers = [
      todo.length > 0 && `${todo.length} élément(s) sans état`,
      missingInfo.length > 0 && `informations manquantes (${missingInfo.join(', ')})`,
      (!inspection.signatures.tenant || !inspection.signatures.landlord) && 'signature(s) manquante(s)',
    ].filter(Boolean) as string[];
    if (blockers.length > 0) {
      const ok = await confirmDialog({ title: 'Générer malgré tout ?', message: `Points en suspens : ${blockers.join(' ; ')}. Ils apparaîtront comme « Non renseigné » dans le PDF.`, confirmLabel: 'Générer le PDF' });
      if (!ok) return;
    }
    update((d) => {
      d.status = 'validated';
      d.validatedAt = new Date().toISOString();
    });
    await flush();
    navigate(`${base}/pdf`);
  };

  return (
    <div className="screen">
      <TopBar title="Récapitulatif" subtitle={titleFor(inspection)} saveState={saveState} back={base} />
      <main className="content stack-lg">
        <section className="card card--pad">
          <p className="muted small">{fullAddress(inspection)}</p>
          <p className="small">
            {formatDate(inspection.dates.inspectionDate)} · Locataire : {inspection.parties.tenant.name || '—'} · Bailleur : {inspection.parties.landlord || '—'}
          </p>
          <div className="stats">
            <div className="stat">
              <strong>{inspection.rooms.length}</strong>
              <span>pièces</span>
            </div>
            <div className={`stat ${todo.length ? 'is-warn' : 'is-ok'}`}>
              <strong>
                {progress.done}/{progress.total}
              </strong>
              <span>éléments</span>
            </div>
            <div className="stat">
              <strong>{progress.photos}</strong>
              <span>photos</span>
            </div>
            <div className={`stat ${attention.length ? 'is-warn' : ''}`}>
              <strong>{attention.length}</strong>
              <span>à signaler</span>
            </div>
          </div>
        </section>

        {missingInfo.length > 0 && (
          <button type="button" className="notice notice--warn notice--link" onClick={() => navigate(`${base}/info`)}>
            <Icon name="info" size={18} />
            <span>À compléter : {missingInfo.join(', ')}</span>
            <Icon name="chevron" size={18} />
          </button>
        )}

        {todoByRoom.length > 0 && (
          <section className="stack-sm">
            <h2 className="section-title">Non renseignés ({todo.length})</h2>
            <div className="card list">
              {todoByRoom.map(({ room, items }) => (
                <div key={room.id} className="list-group">
                  <div className="list-group__title">{room.name}</div>
                  {items.map(({ item }) => (
                    <button key={item.id} type="button" className="list-row list-row--dense" onClick={() => navigate(`${base}/r/${room.id}/e/${item.id}`)}>
                      <span className="list-row__main">
                        <span className="list-row__title">{item.name}</span>
                      </span>
                      <ConditionBadge value={null} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {attention.length > 0 && (
          <section className="stack-sm">
            <h2 className="section-title">Points d’attention ({attention.length})</h2>
            <div className="card list">
              {attention.map(({ room, item }) => (
                <button key={item.id} type="button" className="list-row list-row--dense" onClick={() => navigate(`${base}/r/${room.id}/e/${item.id}`)}>
                  <span className="list-row__main">
                    <span className="list-row__title">
                      {room.name} · {item.name}
                    </span>
                    <span className="list-row__meta is-warn">
                      {isDegraded(item) && `${conditionLabel(item.entry?.condition)} → ${conditionLabel(item.condition)}. `}
                      {item.issues.map((i) => `${i.type}${i.comment ? ` : ${i.comment}` : ''}`).join(' · ')}
                    </span>
                  </span>
                  <ConditionBadge value={item.condition} />
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="card card--pad stack">
          <h2 className="card__title">Observations générales</h2>
          <textarea className="textarea" rows={3} placeholder="Remarques complémentaires, réserves…" value={inspection.generalComment} onChange={(e) => update((d) => (d.generalComment = e.target.value))} />
        </section>

        <section className="card card--pad stack">
          <h2 className="card__title">Signatures</h2>
          <Field label="Fait à">
            <input className="input" value={inspection.signatures.place} placeholder={inspection.property.city || 'Ville'} onChange={(e) => update((d) => (d.signatures.place = e.target.value))} />
          </Field>
          <SignaturePad label={`Locataire${inspection.parties.tenant.name ? ` — ${inspection.parties.tenant.name}` : ''}`} value={inspection.signatures.tenant} onChange={(v) => update((d) => (d.signatures.tenant = v))} />
          <SignaturePad label={`Bailleur ou mandataire${inspection.parties.landlord ? ` — ${inspection.parties.landlord}` : ''}`} value={inspection.signatures.landlord} onChange={(v) => update((d) => (d.signatures.landlord = v))} />
        </section>
      </main>
      <BottomBar>
        <Button variant="primary" size="lg" icon="file" block onClick={() => void validate()}>
          {inspection.status === 'validated' ? 'Regénérer le PDF' : 'Valider et générer le PDF'}
        </Button>
      </BottomBar>
    </div>
  );
}
