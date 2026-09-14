import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { goBack } from '../lib/router';
import type { SaveState } from '../store';

const ICONS: Record<string, ReactNode> = {
  back: <path d="M15 18l-6-6 6-6" />,
  chevron: <path d="M9 18l6-6-6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  camera: (
    <>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.4-2h6.6l1.4 2h1.8A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.8" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.8" />
      <path d="M21 16l-5-5-9 9" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4h6v3" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />,
  upload: <path d="M12 16V5M7 9.5l5-5 5 5M5 20h14" />,
  share: <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
    </>
  ),
  meter: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 13l4-4M8 18h8" />
    </>
  ),
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  sign: <path d="M3 17c3-1 4-9 7-9 2 0 0 7 2 7s2-3 4-3 1 3 5 3M3 21h18" />,
  alert: (
    <>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4.5M12 17.5v.3" />
    </>
  ),
  move: <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />,
  replace: <path d="M4 9a8 8 0 0 1 14-3l2 2M20 4v4h-4M20 15a8 8 0 0 1-14 3l-2-2M4 20v-4h4" />,
  star: <path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5l-5.5 2.9 1-6.3L3 9.7l6.2-.9z" />,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  block?: boolean;
};

export function Button({ variant = 'secondary', size = 'md', icon, block, className = '', children, type = 'button', ...rest }: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, block ? 'btn--block' : '', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 18 : 22} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon, label, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const label = state === 'saving' ? 'Enregistrement…' : state === 'error' ? 'Non enregistré' : 'Enregistré';
  return (
    <span className={`save-ind is-${state}`} role="status" aria-live="polite">
      <span className="save-ind__dot" />
      {label}
    </span>
  );
}

export function TopBar({ title, subtitle, back, right, saveState }: { title: string; subtitle?: string; back?: string; right?: ReactNode; saveState?: SaveState }) {
  return (
    <header className="topbar">
      {back !== undefined ? <IconButton icon="back" label="Retour" className="topbar__back" onClick={() => goBack(back)} /> : <span className="topbar__spacer" />}
      <div className="topbar__text">
        <div className="topbar__title">{title}</div>
        {(subtitle || saveState) && (
          <div className="topbar__sub">
            {saveState && <SaveIndicator state={saveState} />}
            {subtitle && <span className="topbar__subtitle">{subtitle}</span>}
          </div>
        )}
      </div>
      <div className="topbar__right">{right}</div>
    </header>
  );
}

export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="bottombar">
      <div className="bottombar__inner">{children}</div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function Sheet({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        {title && (
          <div className="sheet__head">
            <h2 className="sheet__title">{title}</h2>
            <IconButton icon="close" label="Fermer" onClick={onClose} />
          </div>
        )}
        <div className="sheet__body">{children}</div>
        {actions && <div className="sheet__actions">{actions}</div>}
      </div>
    </div>
  );
}

export interface MenuAction {
  label: string;
  icon: IconName;
  onSelect: () => void;
  danger?: boolean;
}

export function ActionMenu({ title, actions, label = 'Plus d’actions' }: { title?: string; actions: MenuAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton icon="more" label={label} onClick={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="menu-list">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`menu-item ${action.danger ? 'is-danger' : ''}`}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              <Icon name={action.icon} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/* ---------- Dialogues globaux (confirmation, saisie) ---------- */

interface DialogRequest {
  kind: 'confirm' | 'prompt';
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  initial?: string;
  placeholder?: string;
  suggestions?: string[];
  resolve: (value: string | boolean | null) => void;
}

function openDialog(request: Omit<DialogRequest, 'resolve'>): Promise<string | boolean | null> {
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent('app:dialog', { detail: { ...request, resolve } })));
}

export function confirmDialog(options: { title: string; message?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return openDialog({ kind: 'confirm', ...options }).then((v) => v === true);
}

export function promptDialog(options: { title: string; initial?: string; placeholder?: string; confirmLabel?: string; suggestions?: string[] }): Promise<string | null> {
  return openDialog({ kind: 'prompt', ...options }).then((v) => (typeof v === 'string' && v.trim() ? v.trim() : null));
}

export function DialogHost() {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDialog = (event: Event) => {
      const detail = (event as CustomEvent<DialogRequest>).detail;
      setValue(detail.initial ?? '');
      setRequest(detail);
    };
    window.addEventListener('app:dialog', onDialog);
    return () => window.removeEventListener('app:dialog', onDialog);
  }, []);

  useEffect(() => {
    if (request?.kind === 'prompt') setTimeout(() => inputRef.current?.focus(), 50);
  }, [request]);

  if (!request) return null;
  const close = (result: string | boolean | null) => {
    request.resolve(result);
    setRequest(null);
  };
  return (
    <Sheet
      open
      onClose={() => close(null)}
      title={request.title}
      actions={
        <>
          <Button variant="ghost" size="lg" onClick={() => close(null)}>
            Annuler
          </Button>
          <Button variant={request.danger ? 'danger' : 'primary'} size="lg" onClick={() => close(request.kind === 'prompt' ? value : true)}>
            {request.confirmLabel ?? 'Valider'}
          </Button>
        </>
      }
    >
      {request.message && <p className="dialog-message">{request.message}</p>}
      {request.kind === 'prompt' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            close(value);
          }}
        >
          <input ref={inputRef} className="input" value={value} placeholder={request.placeholder} onChange={(e) => setValue(e.target.value)} />
          {request.suggestions && request.suggestions.length > 0 && (
            <div className="chips chips--wrap">
              {request.suggestions.map((s) => (
                <button key={s} type="button" className={`chip ${value === s ? 'is-active' : ''}`} onClick={() => setValue(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </form>
      )}
    </Sheet>
  );
}

export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('app:toast', { detail: message }));
}

export function ToastHost() {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    const onToast = (event: Event) => {
      const id = Date.now() + Math.random();
      setMessages((list) => [...list, { id, text: (event as CustomEvent<string>).detail }]);
      setTimeout(() => setMessages((list) => list.filter((m) => m.id !== id)), 4200);
    };
    window.addEventListener('app:toast', onToast);
    return () => window.removeEventListener('app:toast', onToast);
  }, []);
  return (
    <div className="toast-host" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className="toast">
          {m.text}
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} />
      <strong>{title}</strong>
      {children}
    </div>
  );
}
