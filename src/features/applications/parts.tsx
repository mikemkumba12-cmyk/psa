import React from 'react';
import { CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import type { ApplicationDetail, Offer, Requirement } from '../../api/types';
import { date, dateTime, money, statusLabel } from '../../lib/format';
import { Alert, StatusBadge } from '../../ui/Feedback';
import { DescriptionList, Stat, StatGrid } from '../../ui/Layout';
import { DocumentUploader, type DocumentOwner } from '../documents/Documents';

/** What the applicant needs to provide, and where each item stands. */
export function RequirementsChecklist({ requirements, app, canUpload, onChanged }: {
  requirements: Requirement[]; app: Pick<ApplicationDetail, 'id' | 'customerId' | 'businessId'>; canUpload?: boolean; onChanged?: () => void;
}) {
  if (!requirements.length) return <p className="text-sm text-ink-muted">This product has no required documents.</p>;
  const ownerFor = (requirement: Requirement): DocumentOwner => {
    if (requirement.ownerScope === 'customer') return { customerId: app.customerId };
    if (requirement.ownerScope === 'business' && app.businessId) return { businessId: app.businessId };
    return { applicationId: app.id };
  };
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {requirements.map(requirement => {
        const done = requirement.status === 'verified';
        const Icon = done ? CheckCircle2 : requirement.status === 'pending_review' ? Clock : requirement.status === 'missing' ? Circle : XCircle;
        const color = done ? 'text-success-700' : requirement.status === 'pending_review' ? 'text-warning-700' : requirement.status === 'missing' ? 'text-ink-subtle' : 'text-danger-700';
        const needsUpload = ['missing', 'rejected', 'expired'].includes(requirement.status);
        return (
          <li key={requirement.code} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Icon className={`h-5 w-5 shrink-0 ${color}`} aria-hidden />
              <span className="min-w-0 break-words text-sm font-medium text-ink">{requirement.label}</span>
              <StatusBadge status={requirement.status} />
            </div>
            {canUpload && needsUpload && (
              <DocumentUploader compact documentType={requirement.code} owner={ownerFor(requirement)}
                replacesDocumentId={requirement.status !== 'missing' ? requirement.documentId ?? undefined : undefined}
                label={requirement.status === 'missing' ? 'Upload' : 'Upload a new one'} onUploaded={() => onChanged?.()} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Timeline({ events }: { events: ApplicationDetail['timeline'] }) {
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {events.map((event, index) => (
        <li key={index} className="relative">
          <span className="absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full border-2 border-surface bg-brand-600" aria-hidden />
          <p className="text-sm font-semibold text-ink">{event.from === event.to ? 'Updated' : statusLabel(event.to)}</p>
          <p className="text-xs text-ink-muted">{dateTime(event.at)}{event.actorName ? ` · ${event.actorName}` : ''}</p>
          {event.note && <p className="mt-1 break-words text-sm text-ink-muted">{event.note}</p>}
        </li>
      ))}
    </ol>
  );
}

export function OfferSummary({ offer }: { offer: Offer }) {
  const bullet = offer.repaymentFrequency === 'bullet';
  return (
    <div className="space-y-4">
      <DescriptionList columns={3} items={[
        { label: 'Loan amount', value: money(offer.amount) },
        { label: 'Term', value: `${offer.termMonths} months` },
        { label: 'Interest', value: `${offer.interestRateMonthly}% per month (${offer.interestMethod === 'flat' ? 'flat' : 'reducing balance'})` },
        { label: bullet ? 'Single repayment' : 'Monthly installment', value: money(offer.installmentAmount) },
        { label: 'Total repayable', value: money(offer.totalRepayable) },
        { label: 'Fees', value: offer.fees.length ? offer.fees.map(fee => `${fee.name}: ${money(fee.amount)}${fee.deductedFromDisbursement ? ' (deducted)' : ''}`).join('; ') : 'None' },
        { label: 'You receive', value: money(offer.schedule.netDisbursement) },
        { label: 'Offer valid until', value: dateTime(offer.expiresAt) },
        { label: 'Status', value: <StatusBadge status={offer.status} /> },
      ]} />
      {offer.conditions && <Alert tone="info" title="Conditions">{offer.conditions}</Alert>}
      <p className="text-xs text-ink-muted">{offer.schedule.note}</p>
    </div>
  );
}

export function LoanPositionSummary({ position }: { position: NonNullable<ApplicationDetail['position']> }) {
  return (
    <StatGrid>
      <Stat label="Outstanding balance" value={money(position.outstandingTotal)} hint={`Principal ${money(position.outstandingPrincipal)}`} />
      <Stat label="Next payment" value={position.nextDue ? money(position.nextDue.amount) : '—'} hint={position.nextDue ? `Due ${date(position.nextDue.date)}` : undefined} />
      <Stat label="Overdue" value={money(position.arrearsAmount)} tone={position.arrearsAmount > 0 ? 'danger' : undefined} hint={position.daysPastDue ? `${position.daysPastDue} days past due` : 'Up to date'} />
      <Stat label="Paid so far" value={money(position.paidTotal)} hint={`${position.installmentsPaid} of ${position.installmentsTotal} installments`} />
    </StatGrid>
  );
}

export function ScheduleTable({ schedule }: { schedule: ApplicationDetail['schedule'] }) {
  return (
    <div>
      <ul className="divide-y divide-line md:hidden">
        {schedule.map(line => (
          <li key={line.installmentNumber} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-ink">#{line.installmentNumber} · {date(line.dueDate)}</p>
              <p className="text-xs text-ink-muted">Paid {money(line.paid)} of {money(line.total)}</p>
            </div>
            <StatusBadge status={line.status} />
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">Repayment schedule</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-subtle">
            <th className="py-2 pr-3">#</th><th className="py-2 pr-3">Due</th><th className="py-2 pr-3 text-right">Principal</th>
            <th className="py-2 pr-3 text-right">Interest</th><th className="py-2 pr-3 text-right">Total</th><th className="py-2 pr-3 text-right">Paid</th><th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {schedule.map(line => (
            <tr key={line.installmentNumber}>
              <td className="py-2 pr-3">{line.installmentNumber}</td>
              <td className="py-2 pr-3">{date(line.dueDate)}</td>
              <td className="py-2 pr-3 text-right">{money(line.principal)}</td>
              <td className="py-2 pr-3 text-right">{money(line.interest)}</td>
              <td className="py-2 pr-3 text-right">{money(line.total)}</td>
              <td className="py-2 pr-3 text-right">{money(line.paid)}</td>
              <td className="py-2"><StatusBadge status={line.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EligibilityNotice({ eligibility, membersOnly }: { eligibility: ApplicationDetail['eligibility']; membersOnly: boolean }) {
  if (!membersOnly) return null;
  if (eligibility.eligible) return <Alert tone="success" title="Membership requirements met" />;
  return (
    <Alert tone="warning" title="Membership requirements not yet met">
      <ul className="list-disc space-y-0.5 pl-5">{eligibility.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    </Alert>
  );
}
