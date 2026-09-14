import { useEffect, useRef, useState } from 'react';
import { downloadBlob } from '../lib/backup';
import { fullAddress, pdfFilename, titleFor } from '../lib/format';
import { navigate } from '../lib/router';
import { useInspection } from '../store';
import { Button, Field, Icon, ProgressBar, TopBar, toast } from '../components/ui';

export function PdfScreen() {
  const { inspection, flush } = useInspection();
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipient, setRecipient] = useState(inspection.parties.tenant.email);
  const [run, setRun] = useState(0);
  const urlRef = useRef<string | null>(null);
  const base = `/i/${inspection.id}`;
  const filename = pdfFilename(inspection);

  useEffect(() => {
    let cancelled = false;
    setBlob(null);
    setError(null);
    flush()
      // jsPDF (~500 Ko) n'est charge qu'au moment de generer.
      .then(() => import('../lib/pdf'))
      .then(({ generatePdf }) => generatePdf(inspection, (done, total) => !cancelled && setProgress({ done, total })))
      .then((result) => {
        if (cancelled) return;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(result);
        setBlob(result);
      })
      .catch((e: unknown) => {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'Génération impossible');
      });
    return () => {
      cancelled = true;
    };
    // La generation est relancee uniquement a la demande (run), pas a chaque modification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  useEffect(() => () => void (urlRef.current && URL.revokeObjectURL(urlRef.current)), []);

  const subject = `${titleFor(inspection)} — ${fullAddress(inspection)}`;
  const body = `Bonjour,\n\nVeuillez trouver ci-joint l’${titleFor(inspection).toLowerCase()} du logement situé ${fullAddress(inspection)}.\n\nCordialement,\n${inspection.parties.executedBy || inspection.parties.landlord}`;

  const share = async () => {
    if (!blob) return;
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: subject, text: body });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        console.error('Partage impossible', e);
      }
    }
    downloadBlob(blob, filename);
    window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${body}\n\n(Pensez à joindre le fichier ${filename} qui vient d’être téléchargé.)`)}`;
    toast('PDF téléchargé : joignez-le au message qui s’ouvre');
  };

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.canShare && blob !== null && navigator.canShare({ files: [new File([blob], filename, { type: 'application/pdf' })] });

  return (
    <div className="screen">
      <TopBar title="PDF de l’état des lieux" back={`${base}/recap`} />
      <main className="content stack-lg">
        {!blob && !error && (
          <section className="card card--pad stack center">
            <div className="spinner" />
            <strong>Génération du PDF…</strong>
            <ProgressBar value={progress.done} total={progress.total} />
            <span className="muted small">
              Photos intégrées : {progress.done} / {progress.total}
            </span>
          </section>
        )}
        {error && (
          <section className="notice notice--error stack">
            <strong>La génération a échoué</strong>
            <span>{error}</span>
            <Button variant="secondary" icon="replace" onClick={() => setRun((n) => n + 1)}>
              Réessayer
            </Button>
          </section>
        )}
        {blob && (
          <>
            <section className="card card--pad stack center">
              <span className="done-icon">
                <Icon name="check" size={30} />
              </span>
              <strong>PDF prêt</strong>
              <span className="muted small">
                {filename} · {(blob.size / 1024 / 1024).toFixed(1)} Mo
              </span>
            </section>
            <div className="stack">
              <Button variant="primary" size="lg" icon="download" block onClick={() => downloadBlob(blob, filename)}>
                Télécharger le PDF
              </Button>
              <Button variant="secondary" size="lg" icon="eye" block onClick={() => urlRef.current && window.open(urlRef.current, '_blank')}>
                Aperçu
              </Button>
            </div>
            <section className="card card--pad stack">
              <h2 className="card__title">Envoyer par e-mail</h2>
              {!canNativeShare && (
                <Field label="Destinataire" hint="Le PDF est téléchargé puis votre messagerie s’ouvre avec le message prérempli : il reste à joindre le fichier.">
                  <input className="input" type="email" inputMode="email" value={recipient} placeholder="locataire@exemple.fr" onChange={(e) => setRecipient(e.target.value)} />
                </Field>
              )}
              {canNativeShare && <p className="muted small">Le PDF est joint automatiquement : choisissez Mail, Gmail ou Outlook dans le menu de partage.</p>}
              <Button variant="secondary" size="lg" icon="mail" block onClick={() => void share()}>
                {canNativeShare ? 'Envoyer / partager le PDF' : 'Préparer l’e-mail'}
              </Button>
            </section>
            <Button variant="ghost" icon="replace" onClick={() => setRun((n) => n + 1)}>
              Regénérer après modification
            </Button>
          </>
        )}
        <Button variant="ghost" icon="back" onClick={() => navigate(base)}>
          Retour à l’état des lieux
        </Button>
      </main>
    </div>
  );
}
