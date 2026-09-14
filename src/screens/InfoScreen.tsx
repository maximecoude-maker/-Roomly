import type { Inspection } from '../types';
import { useInspection } from '../store';
import { Field, TopBar } from '../components/ui';
import { PhotoField } from '../components/Photos';

type TextPath = (d: Inspection) => { get: () => string; set: (v: string) => void };

export function InfoScreen() {
  const { inspection, update, saveState } = useInspection();
  const base = `/i/${inspection.id}`;

  const input = (label: string, path: TextPath, options: { type?: string; inputMode?: 'tel' | 'email' | 'numeric' | 'text'; placeholder?: string; autoComplete?: string } = {}) => (
    <Field label={label}>
      <input
        className="input"
        type={options.type ?? 'text'}
        inputMode={options.inputMode}
        autoComplete={options.autoComplete ?? 'off'}
        placeholder={options.placeholder}
        value={path(inspection).get()}
        onChange={(e) => {
          const value = e.target.value;
          update((d) => path(d).set(value));
        }}
      />
    </Field>
  );

  return (
    <div className="screen">
      <TopBar title="Informations générales" saveState={saveState} back={base} />
      <main className="content stack-lg">
        <section className="card card--pad stack">
          <h2 className="card__title">Logement</h2>
          {input('Référence', (d) => ({ get: () => d.property.reference, set: (v) => (d.property.reference = v) }), { placeholder: 'Ex : T3 65 m² Lorient' })}
          {input('Adresse', (d) => ({ get: () => d.property.address, set: (v) => (d.property.address = v) }), { autoComplete: 'street-address' })}
          <div className="grid-2">
            {input('Code postal', (d) => ({ get: () => d.property.postalCode, set: (v) => (d.property.postalCode = v) }), { inputMode: 'numeric' })}
            {input('Ville', (d) => ({ get: () => d.property.city, set: (v) => (d.property.city = v) }))}
          </div>
          {input('Description', (d) => ({ get: () => d.property.description, set: (v) => (d.property.description = v) }), { placeholder: 'Type, surface, étage…' })}
          <div className="field">
            <span className="field__label">Photo de couverture</span>
            <PhotoField target={{ kind: 'cover' }} ids={inspection.property.coverPhotoId ? [inspection.property.coverPhotoId] : []} compact />
          </div>
        </section>

        <section className="card card--pad stack">
          <h2 className="card__title">Parties</h2>
          {input('Bailleur', (d) => ({ get: () => d.parties.landlord, set: (v) => (d.parties.landlord = v) }))}
          {input('Gestionnaire immobilier', (d) => ({ get: () => d.parties.manager, set: (v) => (d.parties.manager = v) }))}
          {input('Réalisé par', (d) => ({ get: () => d.parties.executedBy, set: (v) => (d.parties.executedBy = v) }))}
        </section>

        <section className="card card--pad stack">
          <h2 className="card__title">Locataire</h2>
          {input('Nom et prénom', (d) => ({ get: () => d.parties.tenant.name, set: (v) => (d.parties.tenant.name = v) }))}
          <div className="grid-2">
            {input('Téléphone', (d) => ({ get: () => d.parties.tenant.phone, set: (v) => (d.parties.tenant.phone = v) }), { type: 'tel', inputMode: 'tel' })}
            {input('E-mail', (d) => ({ get: () => d.parties.tenant.email, set: (v) => (d.parties.tenant.email = v) }), { type: 'email', inputMode: 'email' })}
          </div>
          <div className="grid-2">
            {input('Date de naissance', (d) => ({ get: () => d.parties.tenant.birthDate, set: (v) => (d.parties.tenant.birthDate = v) }), { type: 'date' })}
            {input('Lieu de naissance', (d) => ({ get: () => d.parties.tenant.birthPlace, set: (v) => (d.parties.tenant.birthPlace = v) }))}
          </div>
        </section>

        <section className="card card--pad stack">
          <h2 className="card__title">Dates</h2>
          <div className="grid-2">
            {input('Date de l’état des lieux', (d) => ({ get: () => d.dates.inspectionDate, set: (v) => (d.dates.inspectionDate = v) }), { type: 'date' })}
            {input('Début du bail', (d) => ({ get: () => d.dates.leaseStart, set: (v) => (d.dates.leaseStart = v) }), { type: 'date' })}
          </div>
          <div className="grid-2">
            {input('Date d’entrée', (d) => ({ get: () => d.dates.moveInDate, set: (v) => (d.dates.moveInDate = v) }), { type: 'date' })}
            {inspection.type === 'sortie' && input('Date de sortie', (d) => ({ get: () => d.dates.moveOutDate, set: (v) => (d.dates.moveOutDate = v) }), { type: 'date' })}
          </div>
        </section>
      </main>
    </div>
  );
}
