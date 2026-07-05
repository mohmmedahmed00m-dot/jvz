import { useState, ButtonHTMLAttributes, ReactNode, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';
import './styles-import';

/* ============================================================================
   Reusable UI components (Section 7.4) — Button, Card, Badge, Input, Tabs,
   Modal, Toggle, Accordion, Progress. All styled via components.css tokens.
   ========================================================================== */

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'accent';

export function Button({
  variant = 'primary',
  compact,
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; compact?: boolean; loading?: boolean }) {
  const cls = ['btn', variant !== 'primary' ? `btn--${variant}` : '', compact ? 'btn--compact' : '']
    .filter(Boolean).join(' ');
  return (
    <button {...rest} className={`${cls} ${rest.className || ''}`} disabled={rest.disabled || loading}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Card({
  children, interactive, status, className = '', onClick, style,
}: { children: ReactNode; interactive?: boolean; status?: string; className?: string; onClick?: () => void; style?: React.CSSProperties }) {
  const cls = ['card', interactive ? 'card--interactive' : '', status ? `card--status ${status}` : '']
    .filter(Boolean).join(' ');
  return <div className={`${cls} ${className}`} onClick={onClick} style={style}>{children}</div>;
}

export function Badge({ children, type }: { children: ReactNode; type?: string }) {
  return <span className={`badge ${type || ''}`}>{children}</span>;
}

export function Field({ label, error, hint, children, htmlFor }: {
  label?: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string;
}) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text" role="alert">{error}</span>}
    </div>
  );
}

export function Input({ invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} className={`input ${invalid ? 'invalid' : ''} ${rest.className || ''}`} aria-invalid={invalid || undefined} />;
}
export function Textarea({ invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...rest} className={`textarea ${invalid ? 'invalid' : ''} ${rest.className || ''}`} />;
}
export function Select({ invalid, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select {...rest} className={`select ${invalid ? 'invalid' : ''} ${rest.className || ''}`}>{children}</select>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Tabs({ tabs, active, onChange }: {
  tabs: { id: string; label: string; unsaved?: boolean }[]; active: string; onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={active === t.id}
          className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
          {t.unsaved && <span className="unsaved-dot" title="Unsaved changes" />}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, children, onClose, footer }: {
  title: string; children: ReactNode; onClose: () => void; footer?: ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div>{children}</div>
        {footer && <div className="row between" style={{ marginTop: 'var(--space-5)' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Accordion({ items }: { items: { id: string; head: ReactNode; body: ReactNode; openByDefault?: boolean }[] }) {
  const initial = new Set<string>(items.filter((i) => i.openByDefault).map((i) => i.id));
  const [open, setOpen] = useState<Set<string>>(initial);
  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  return (
    <div>
      {items.map((it) => (
        <div className="accordion-item" key={it.id}>
          <div className="accordion-head" onClick={() => toggle(it.id)}>
            {it.head}
            <span>{open.has(it.id) ? '−' : '+'}</span>
          </div>
          {open.has(it.id) && <div className="accordion-body">{it.body}</div>}
        </div>
      ))}
    </div>
  );
}

export function Steps({ steps }: { steps: { id: string; label: string; state: 'pending' | 'active' | 'done' | 'failed' }[] }) {
  return (
    <div className="steps" aria-live="polite" aria-busy={steps.some((s) => s.state === 'active')}>
      {steps.map((s) => (
        <div className={`step ${s.state}`} key={s.id}>
          <span className="dot">
            {s.state === 'active' && <span className="spinner-sm" />}
            {s.state === 'done' && '✓'}
          </span>
          {s.label}
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return <div className="progress"><div style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

export function Spinner() {
  return <span className="spinner" style={{ display: 'inline-block', verticalAlign: 'middle', borderColor: 'rgba(0,0,0,.2)', borderTopColor: 'var(--color-primary)' }} />;
}

export function EmptyState({ title, cta }: { title: string; cta?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="ill">🚀</div>
      <p style={{ marginBottom: 'var(--space-4)' }}>{title}</p>
      {cta}
    </div>
  );
}
