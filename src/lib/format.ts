export function money(value: number | null | undefined, options: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (options.compact && Math.abs(value) >= 1_000_000) {
    return `MWK ${(value / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
  }
  return `MWK ${value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: value % 1 ? 2 : 0 })}`;
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function date(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function relative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date(value);
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  info_requested: 'Information requested',
  assessed: 'Assessed',
  recommended: 'Awaiting decision',
  approved: 'Approved',
  rejected: 'Not approved',
  offer_issued: 'Offer ready',
  offer_accepted: 'Offer accepted',
  offer_declined: 'Offer declined',
  disbursed: 'Active loan',
  closed: 'Repaid',
  withdrawn: 'Withdrawn',
  pending_review: 'Awaiting review',
  verified: 'Verified',
  replaced: 'Replaced',
  missing: 'Missing',
  expired: 'Expired',
  unverified: 'Not verified',
  pending_verification: 'Awaiting verification',
  pending: 'Pending',
  active: 'Active',
  suspended: 'Suspended',
  terminated: 'Terminated',
  retired: 'Retired',
  pending_confirmation: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  issued: 'Issued',
  accepted: 'Accepted',
  declined: 'Declined',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? titleCase(status);
}

export const ROLE_LABELS: Record<string, string> = {
  customer: 'Customer',
  loan_officer: 'Loan officer',
  manager: 'Manager',
  executive: 'Executive',
  admin: 'Administrator',
  owner: 'Owner',
  director: 'Director',
  beneficial_owner: 'Beneficial owner',
  representative: 'Authorised representative',
  guarantor: 'Guarantor',
};

export const CATEGORY_LABELS: Record<string, string> = {
  payroll: 'Payroll',
  personal: 'Personal',
  working_capital: 'Working capital',
  enterprise: 'Enterprise',
  asset_financing: 'Asset financing',
  invoice_discounting: 'Invoice discounting',
  order_financing: 'Order financing',
};
