import { useEffect, useRef, useState } from 'react';
import type { Condition, Issue, KeyValue } from '../types';
import { CONDITIONS, ISSUE_TYPES, conditionLabel } from '../lib/format';
import { uid } from '../lib/ids';
import { Button, IconButton } from './ui';

export function ConditionPicker({ value, onChange }: { value: Condition | null; onChange: (value: Condition | null) => void }) {
  return (
    <div className="cond-grid" role="radiogroup" aria-label="État">
      {CONDITIONS.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          data-cond={c.value}
          className={`cond-btn ${value === c.value ? 'is-active' : ''}`}
          onClick={() => onChange(value === c.value ? null : c.value)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function ConditionBadge({ value, prefix }: { value: Condition | null | undefined; prefix?: string }) {
  return (
    <span className={`badge badge--cond ${value ? '' : 'is-empty'}`} data-cond={value ?? 'none'}>
      {prefix && <span className="badge__prefix">{prefix}</span>}
      {value ? CONDITIONS.find((c) => c.value === value)?.short : 'À faire'}
    </span>
  );
}

export function ChoiceChips({ options, value, onChange }: { options: string[]; value: string; onChange: (value: string) => void }) {
  const all = options.includes(value) || !value ? options : [...options, value];
  return (
    <div className="chips">
      {all.map((option) => (
        <button key={option} type="button" className={`chip ${option === value ? 'is-active' : ''}`} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}

export function KeyValueEditor({ rows, onChange, addLabel, labelPlaceholder = 'Libellé', valuePlaceholder = 'Valeur' }: { rows: KeyValue[]; onChange: (rows: KeyValue[]) => void; addLabel: string; labelPlaceholder?: string; valuePlaceholder?: string }) {
  const patch = (id: string, changes: Partial<KeyValue>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  return (
    <div className="kv">
      {rows.map((row) => (
        <div key={row.id} className="kv-row">
          <input className="input" value={row.label} placeholder={labelPlaceholder} aria-label={labelPlaceholder} onChange={(e) => patch(row.id, { label: e.target.value })} />
          <input className="input" value={row.value} placeholder={valuePlaceholder} aria-label={valuePlaceholder} onChange={(e) => patch(row.id, { value: e.target.value })} />
          <IconButton icon="trash" label="Supprimer la ligne" onClick={() => onChange(rows.filter((r) => r.id !== row.id))} />
        </div>
      ))}
      <Button variant="ghost" size="sm" icon="plus" onClick={() => onChange([...rows, { id: uid(), label: '', value: '' }])}>
        {addLabel}
      </Button>
    </div>
  );
}

export function IssuesEditor({ issues, onChange }: { issues: Issue[]; onChange: (issues: Issue[]) => void }) {
  const patch = (id: string, changes: Partial<Issue>) => onChange(issues.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  return (
    <div className="stack">
      {issues.map((issue) => (
        <div key={issue.id} className="issue">
          <div className="issue__head">
            <ChoiceChips options={ISSUE_TYPES} value={issue.type} onChange={(type) => patch(issue.id, { type })} />
            <IconButton icon="trash" label="Supprimer le constat" onClick={() => onChange(issues.filter((i) => i.id !== issue.id))} />
          </div>
          <textarea className="textarea" rows={2} value={issue.comment} placeholder="Décrire le constat (emplacement, taille…)" onChange={(e) => patch(issue.id, { comment: e.target.value })} />
        </div>
      ))}
      <Button variant="secondary" icon="alert" onClick={() => onChange([...issues, { id: uid(), type: 'Dégâts', comment: '' }])}>
        Signaler un constat
      </Button>
    </div>
  );
}

/** Zone de signature tactile ; restitue une image PNG en data URL. */
export function SignaturePad({ value, onChange, label }: { value?: string; onChange: (value: string | undefined) => void; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [editing, setEditing] = useState(!value);

  useEffect(() => {
    if (!editing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#11151c';
  }, [editing]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current?.toDataURL('image/png'));
  };

  return (
    <div className="sig">
      <div className="sig__head">
        <span className="field__label">{label}</span>
        {value && !editing && (
          <Button
            variant="ghost"
            size="sm"
            icon="replace"
            onClick={() => {
              onChange(undefined);
              setEditing(true);
            }}
          >
            Refaire
          </Button>
        )}
        {editing && (
          <Button
            variant="ghost"
            size="sm"
            icon="trash"
            onClick={() => {
              const canvas = canvasRef.current;
              canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
              onChange(undefined);
            }}
          >
            Effacer
          </Button>
        )}
      </div>
      {value && !editing ? (
        <img className="sig__img" src={value} alt={`Signature ${label}`} />
      ) : (
        <canvas ref={canvasRef} className="sig__canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label={`Zone de signature ${label}`} />
      )}
      {editing && <span className="field__hint">Signez avec le doigt dans le cadre</span>}
    </div>
  );
}

export { conditionLabel };
