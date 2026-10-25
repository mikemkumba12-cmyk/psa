import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export function PageHeader({ title, description, actions, back, meta }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: { to: string; label: string }; meta?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink">
          <ChevronLeft className="h-4 w-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-bold text-ink sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({ title, description, actions, children, padded = true, className = '' }: {
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; padded?: boolean; className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-card border border-line bg-surface shadow-card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'p-4 sm:p-5' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'danger' | 'warning' | 'success' }) {
  const color = tone === 'danger' ? 'text-danger-700' : tone === 'warning' ? 'text-warning-700' : tone === 'success' ? 'text-success-700' : 'text-ink';
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className={`mt-1 break-words text-xl font-bold tabular-nums sm:text-2xl ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

export function DescriptionList({ items, columns = 2 }: { items: Array<{ label: string; value: React.ReactNode } | false | null | undefined>; columns?: 1 | 2 | 3 }) {
  const cols = columns === 1 ? '' : columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2';
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-4 ${cols}`}>
      {items.filter(Boolean).map(item => item && (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{item.label}</dt>
          <dd className="mt-1 break-words text-sm text-ink">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: Array<{ id: NoInfer<T>; label: string; count?: number }>; value: T; onChange: (id: NoInfer<T>) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {tabs.map(tab => (
        <button key={tab.id} role="tab" type="button" aria-selected={tab.id === value} onClick={() => onChange(tab.id)}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${tab.id === value ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'}`}>
          {tab.label}
          {tab.count !== undefined && <span className="ml-1.5 rounded-full bg-surface-muted px-1.5 py-0.5 text-xs text-ink-muted">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
