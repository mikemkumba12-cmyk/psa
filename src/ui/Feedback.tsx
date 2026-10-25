import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, Inbox } from 'lucide-react';
import { statusLabel } from '../lib/format';
import { Button } from './Button';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-ink-muted ring-line-strong',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  success: 'bg-success-50 text-success-700 ring-success-700/20',
  warning: 'bg-warning-50 text-warning-700 ring-warning-700/20',
  danger: 'bg-danger-50 text-danger-700 ring-danger-700/20',
  info: 'bg-info-50 text-info-700 ring-info-700/20',
};

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex w-fit max-w-full shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]} ${className}`}>
      <span className="truncate">{children}</span>
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  draft: 'neutral', submitted: 'info', under_review: 'info', info_requested: 'warning', assessed: 'info', recommended: 'brand',
  approved: 'success', rejected: 'danger', offer_issued: 'brand', offer_accepted: 'success', offer_declined: 'neutral',
  disbursed: 'success', closed: 'neutral', withdrawn: 'neutral',
  pending_review: 'warning', verified: 'success', replaced: 'neutral', missing: 'danger', expired: 'danger',
  unverified: 'neutral', pending_verification: 'warning', pending: 'warning', active: 'success', suspended: 'danger', terminated: 'neutral',
  retired: 'neutral', pending_confirmation: 'warning', confirmed: 'success', issued: 'brand', accepted: 'success', declined: 'neutral',
  overdue: 'danger', paid: 'success', partially_paid: 'warning', scheduled: 'neutral',
};

/** One consistent status pill for every workflow status in the system. */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{label ?? statusLabel(status)}</Badge>;
}

export function DemoBadge({ show }: { show?: boolean }) {
  return show ? <Badge tone="warning">Demo data</Badge> : null;
}

const ALERT_ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: AlertCircle };

export function Alert({ tone = 'info', title, children, action }: {
  tone?: 'info' | 'success' | 'warning' | 'danger'; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode;
}) {
  const Icon = ALERT_ICONS[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex gap-3 rounded-lg p-3 ring-1 ring-inset ${TONES[tone]}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={`break-words ${title ? 'mt-0.5' : ''}`}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex min-h-40 items-center justify-center p-6"><Spinner label={label} /></div>;
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-3 rounded-full bg-surface-muted p-3 text-ink-subtle">{icon ?? <Inbox className="h-6 w-6" aria-hidden />}</div>
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: { message: string; status?: number } | null; onRetry?: () => void }) {
  if (!error) return null;
  const title = error.status === 403 ? 'You don’t have access to this' : error.status === 404 ? 'Not found' : 'Couldn’t load this';
  return (
    <div className="p-4">
      <Alert tone="danger" title={title} action={onRetry && error.status !== 403 && error.status !== 404 ? <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button> : undefined}>
        {error.message}
      </Alert>
    </div>
  );
}
