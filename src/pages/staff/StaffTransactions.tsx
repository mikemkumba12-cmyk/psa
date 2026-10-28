import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { date, money, relative, titleCase } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button } from '../../ui/Button';
import { Alert, EmptyState, ErrorState, LoadingBlock, StatusBadge } from '../../ui/Feedback';
import { TextArea } from '../../ui/Form';
import { Card, PageHeader, Tabs } from '../../ui/Layout';
import { ConfirmDialog } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

interface QueueItem {
  id: string; applicationId: string; reference: string; applicantName: string; type: 'disbursement' | 'repayment'; amount: number; valueDate: string;
  channel: string; externalReference: string; status: string; notes: string | null; recordedBy: string; recordedAt: string;
  confirmedBy: string | null; confirmedAt: string | null; rejectionReason: string | null; canConfirm: boolean;
}

/** Checker queue: confirm money movements recorded by someone else after matching them to the bank or payroll record. */
export function StaffTransactions() {
  const toast = useToast();
  const [status, setStatus] = useState<'pending_confirmation' | 'confirmed' | 'rejected'>('pending_confirmation');
  const { data, error, loading, reload } = useResource<QueueItem[]>(`/api/transactions?status=${status}`);
  const [confirming, setConfirming] = useState<QueueItem | null>(null);
  const [rejecting, setRejecting] = useState<QueueItem | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);

  const act = async (path: string, body: unknown, message: string) => {
    setPending(true);
    try {
      await api(path, { body });
      toast(message);
      setConfirming(null);
      setRejecting(null);
      setReason('');
      await reload();
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.message : 'Something went wrong.', 'error');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader title="Transactions" description="Disbursements and repayments change a loan only after a second person confirms them." />
      <Tabs label="Transaction status" value={status} onChange={setStatus} tabs={[
        { id: 'pending_confirmation', label: 'To confirm' }, { id: 'confirmed', label: 'Confirmed' }, { id: 'rejected', label: 'Rejected' },
      ]} />
      <Card padded={false}>
        {error && <ErrorState error={error} onRetry={reload} />}
        {loading && !data && <LoadingBlock />}
        {data?.length === 0 && <EmptyState title="Nothing here" />}
        <ul className="divide-y divide-line">
          {data?.map(item => (
            <li key={item.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-ink">{titleCase(item.type)} · {money(item.amount)} <StatusBadge status={item.status} /></p>
                <p className="text-ink-muted"><Link className="font-medium text-brand-700 hover:underline" to={`/staff/applications/${item.applicationId}`}>{item.reference}</Link> · {item.applicantName}</p>
                <p className="text-ink-muted">{titleCase(item.channel)} ref <span className="font-mono">{item.externalReference}</span> · value date {date(item.valueDate)}</p>
                <p className="text-xs text-ink-subtle">Recorded by {item.recordedBy} {relative(item.recordedAt)}{item.confirmedBy ? ` · ${item.status === 'rejected' ? 'rejected' : 'confirmed'} by ${item.confirmedBy}` : ''}</p>
                {item.notes && <p className="mt-1 text-xs text-ink-muted">{item.notes}</p>}
                {item.rejectionReason && <p className="mt-1 text-xs text-danger-700">{item.rejectionReason}</p>}
              </div>
              {item.status === 'pending_confirmation' && (
                item.canConfirm ? (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setRejecting(item)}>Reject</Button>
                    <Button variant="success" onClick={() => setConfirming(item)}>Confirm</Button>
                  </div>
                ) : <p className="text-xs text-ink-subtle">{`You recorded this or lack confirm rights.`}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <ConfirmDialog open={Boolean(confirming)} onClose={() => setConfirming(null)} tone="success" confirmLabel="Confirm" pending={pending}
        title={`Confirm ${confirming?.type}?`}
        message={confirming && <>Confirm that {money(confirming.amount)} with reference <strong>{confirming.externalReference}</strong> appears in the {titleCase(confirming.channel).toLowerCase()} record dated {date(confirming.valueDate)}.{confirming.type === 'disbursement' ? ' The repayment schedule will start from this date.' : ''}</>}
        onConfirm={() => confirming && act(`/api/transactions/${confirming.id}/confirm`, {}, 'Transaction confirmed.')} />
      <ConfirmDialog open={Boolean(rejecting)} onClose={() => setRejecting(null)} tone="danger" confirmLabel="Reject" pending={pending} title="Reject transaction?"
        onConfirm={() => rejecting && act(`/api/transactions/${rejecting.id}/reject`, { reason }, 'Transaction rejected.')}>
        <Alert tone="info">The person who recorded it will be notified.</Alert>
        <div className="mt-3"><TextArea label="Reason" required rows={3} value={reason} onChange={event => setReason(event.target.value)} /></div>
      </ConfirmDialog>
    </>
  );
}
