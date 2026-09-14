import { useEffect, useState } from 'react';
import type { Inspection, InspectionType } from '../types';
import template from '../seed/template.json';
import { requestPersistence, listInspections } from '../lib/db';
import { createBlank, createExitFrom, createFromTemplate } from '../lib/factory';
import { formatDate, fullAddress } from '../lib/format';
import { navigate } from '../lib/router';
import { Icon, TopBar, toast } from '../components/ui';

const templateStats = {
  rooms: template.rooms.length,
  items: template.rooms.reduce((n, r) => n + r.sections.reduce((m, s) => m + s.items.length, 0), 0),
  photos: 67,
};

export function NewInspection() {
  const [type, setType] = useState<InspectionType | null>(null);
  const [entries, setEntries] = useState<Inspection[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    listInspections()
      .then((all) => setEntries(all.filter((i) => i.type === 'entree')))
      .catch((error: unknown) => console.error(error));
  }, []);

  const run = async (label: string, create: () => Promise<Inspection>) => {
    setBusy(label);
    try {
      void requestPersistence();
      const inspection = await create();
      navigate(`/i/${inspection.id}`, true);
    } catch (error) {
      console.error(error);
      toast(error instanceof Error ? error.message : 'Création impossible');
      setBusy(null);
    }
  };

  const Option = ({ id, icon, title, desc, tag, onClick }: { id: string; icon: 'file' | 'home' | 'copy'; title: string; desc: string; tag?: string; onClick: () => void }) => (
    <button type="button" className="option" disabled={busy !== null} onClick={onClick}>
      <span className="option__icon">
        <Icon name={icon} />
      </span>
      <span className="option__text">
        <span className="option__title">
          {title}
          {tag && <span className="badge badge--accent">{tag}</span>}
        </span>
        <span className="option__desc">{busy === id ? 'Préparation en cours…' : desc}</span>
      </span>
      <Icon name="chevron" />
    </button>
  );

  return (
    <div className="screen">
      <TopBar title="Nouvel état des lieux" back={type ? undefined : '/'} right={null} />
      {type && (
        <button type="button" className="step-back" onClick={() => setType(null)}>
          <Icon name="back" size={18} /> Changer de type
        </button>
      )}
      <main className="content">
        {!type ? (
          <>
            <h2 className="section-title">Type d’état des lieux</h2>
            <div className="type-grid">
              <button type="button" className="type-card" onClick={() => setType('entree')}>
                <span className="type-card__icon is-entree">
                  <Icon name="download" size={26} />
                </span>
                <strong>Entrée</strong>
                <span className="muted small">Arrivée du locataire</span>
              </button>
              <button type="button" className="type-card" onClick={() => setType('sortie')}>
                <span className="type-card__icon is-sortie">
                  <Icon name="upload" size={26} />
                </span>
                <strong>Sortie</strong>
                <span className="muted small">Comparaison avec l’entrée</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="section-title">{type === 'entree' ? 'Point de départ' : 'État des lieux d’entrée de référence'}</h2>
            <div className="stack">
              {type === 'sortie' &&
                entries.map((entry, index) => (
                  <Option
                    key={entry.id}
                    id={entry.id}
                    icon="copy"
                    tag={index === 0 ? 'Recommandé' : undefined}
                    title={`Entrée du ${formatDate(entry.dates.inspectionDate)}`}
                    desc={`${fullAddress(entry)} · ${entry.parties.tenant.name || 'locataire non renseigné'}`}
                    onClick={() => void run(entry.id, () => createExitFrom(entry.id))}
                  />
                ))}
              <Option
                id="template"
                icon="file"
                tag={type === 'entree' || entries.length === 0 ? 'Recommandé' : undefined}
                title={type === 'entree' ? 'Modèle issu du PDF' : 'Entrée du PDF (20/01/2024)'}
                desc={`${template.property.address}, ${template.property.city} · ${templateStats.rooms} pièces · ${templateStats.items} éléments · ${templateStats.photos} photos`}
                onClick={() => void run('template', () => createFromTemplate(type))}
              />
              <Option id="blank" icon="home" title="Logement vierge" desc="6 pièces types à adapter, sans photo" onClick={() => void run('blank', () => createBlank(type))} />
            </div>
            {type === 'sortie' && <p className="muted small note">Chaque élément affichera l’état constaté à l’entrée, avec ses photos, pour comparer d’un coup d’œil.</p>}
          </>
        )}
      </main>
    </div>
  );
}
