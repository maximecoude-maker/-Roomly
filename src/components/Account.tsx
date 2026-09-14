import { useState } from 'react';
import { formatDateTime } from '../lib/format';
import { setPassword, signInWithEmail, signInWithPassword, signOut, syncNow, useSync, type SyncStatus } from '../lib/sync';
import { Button, Field, Icon, Sheet, confirmDialog, toast } from './ui';

const LABELS: Record<SyncStatus, string> = {
  off: 'Local',
  signedOut: 'Se connecter',
  idle: 'Synchronisé',
  syncing: 'Synchro…',
  offline: 'Hors ligne',
  error: 'Erreur de synchro',
};

const MIN_PASSWORD = 8;

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
        {sync.email ? <SignedIn onDone={() => setOpen(false)} /> : <SignInForm onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [email, setEmail] = useState('');
  const [password, setPasswordValue] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.includes('@')) {
      toast('Adresse e-mail invalide');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'password') {
        await signInWithPassword(email.trim(), password);
        toast('Connecté');
        onDone();
      } else {
        await signInWithEmail(email.trim());
        setSent(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connexion impossible';
      toast(/rate limit/i.test(message) ? 'Trop d’e-mails envoyés : réessayez dans une heure ou connectez-vous avec un mot de passe' : message);
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
      <div className="chips" role="tablist" aria-label="Mode de connexion">
        <button type="button" role="tab" aria-selected={mode === 'password'} className={`chip ${mode === 'password' ? 'is-active' : ''}`} onClick={() => setMode('password')}>
          Mot de passe
        </button>
        <button type="button" role="tab" aria-selected={mode === 'link'} className={`chip ${mode === 'link' ? 'is-active' : ''}`} onClick={() => setMode('link')}>
          Lien par e-mail
        </button>
      </div>
      <Field label="Adresse e-mail">
        <input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.fr" />
      </Field>
      {mode === 'password' && (
        <Field label="Mot de passe" hint="Pas encore de mot de passe ? Connectez-vous d’abord par lien e-mail, puis définissez-le depuis votre compte.">
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPasswordValue(e.target.value)} />
        </Field>
      )}
      <Button type="submit" variant="primary" size="lg" icon={mode === 'password' ? 'check' : 'mail'} block disabled={busy || (mode === 'password' && password.length === 0)}>
        {busy ? 'Connexion…' : mode === 'password' ? 'Se connecter' : 'Recevoir le lien de connexion'}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (value.length < MIN_PASSWORD) {
      toast(`Au moins ${MIN_PASSWORD} caractères`);
      return;
    }
    setBusy(true);
    try {
      await setPassword(value);
      setValue('');
      toast('Mot de passe enregistré : utilisez-le pour vous connecter sur vos autres appareils');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="stack-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="Mot de passe" hint="Permet de se connecter sur un autre appareil sans attendre d’e-mail.">
        <input className="input" type="password" autoComplete="new-password" value={value} placeholder={`${MIN_PASSWORD} caractères minimum`} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" disabled={busy || value.length === 0}>
        {busy ? 'Enregistrement…' : 'Définir le mot de passe'}
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
      <PasswordForm />
      <Button variant="ghost" onClick={() => void logout()}>
        Se déconnecter
      </Button>
    </div>
  );
}
