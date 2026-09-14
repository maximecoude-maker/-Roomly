import { useState } from 'react';
import { formatDateTime } from '../lib/format';
import { signInWithEmail, signOut, syncNow, useSync, type SyncStatus } from '../lib/sync';
import { Button, Field, Icon, Sheet, confirmDialog, toast } from './ui';

const LABELS: Record<SyncStatus, string> = {
  off: 'Local',
  signedOut: 'Se connecter',
  idle: 'Synchronisé',
  syncing: 'Synchro…',
  offline: 'Hors ligne',
  error: 'Erreur de synchro',
};

/** Pastille d'etat de synchronisation + fenetre de compte. */
export function SyncButton() {
  const sync = useSync();
  const [open, setOpen] = useState(false);
  if (sync.status === 'off') return null;
  const label = sync.status === 'idle' && sync.pending > 0 ? `${sync.pending} en attente` : LABELS[sync.status];
  return (
    <>
      <button type="button" className={`sync-pill is-${sync.status}`} onClick={() => setOpen(true)}>
        <span className="sync-pill__dot" />
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={sync.email ? 'Compte et synchronisation' : 'Se connecter'}>
        {sync.email ? <SignedIn onDone={() => setOpen(false)} /> : <SignInForm />}
      </Sheet>
    </>
  );
}

function SignInForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.includes('@')) {
      toast('Adresse e-mail invalide');
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(email.trim());
      setSent(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Envoi impossible');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="stack">
        <p className="dialog-message">
          Lien de connexion envoyé à <strong>{email}</strong>. Ouvrez-le <strong>sur cet appareil</strong> pour activer la synchronisation.
        </p>
        <Button variant="ghost" onClick={() => setSent(false)}>
          Utiliser une autre adresse
        </Button>
      </div>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="dialog-message">Connectez-vous pour sauvegarder vos états des lieux et photos en ligne et les retrouver sur tous vos appareils. Sans connexion, tout reste sur cet appareil.</p>
      <Field label="Adresse e-mail">
        <input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.fr" />
      </Field>
      <Button type="submit" variant="primary" size="lg" icon="mail" block disabled={busy}>
        {busy ? 'Envoi…' : 'Recevoir le lien de connexion'}
      </Button>
    </form>
  );
}

function SignedIn({ onDone }: { onDone: () => void }) {
  const sync = useSync();
  const logout = async () => {
    const ok = await confirmDialog({ title: 'Se déconnecter ?', message: 'Les états des lieux restent sur cet appareil mais ne seront plus synchronisés.', confirmLabel: 'Se déconnecter' });
    if (!ok) return;
    try {
      await signOut();
      onDone();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Déconnexion impossible');
    }
  };
  return (
    <div className="stack">
      <div className="account-row">
        <Icon name="info" />
        <div>
          <strong>{sync.email}</strong>
          <p className="muted small">
            {LABELS[sync.status]}
            {sync.lastSyncAt && ` · dernière synchro ${formatDateTime(sync.lastSyncAt)}`}
          </p>
        </div>
      </div>
      {sync.pending > 0 && <p className="notice notice--warn">{sync.pending} modification(s) en attente d’envoi</p>}
      {sync.error && <p className="notice notice--error">{sync.error}</p>}
      <Button variant="primary" size="lg" icon="replace" block disabled={sync.status === 'syncing'} onClick={syncNow}>
        Synchroniser maintenant
      </Button>
      <Button variant="ghost" onClick={() => void logout()}>
        Se déconnecter
      </Button>
    </div>
  );
}
