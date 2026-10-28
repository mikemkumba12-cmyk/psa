import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PlusCircle } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { ApplicationDetail, ApplicationSummary, Paged } from '../../api/types';
import { date, money } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button, ButtonLink } from '../../ui/Button';
import { Alert, ErrorState, LoadingBlock, StatusBadge } from '../../ui/Feedback';
import { DataTable } from '../../ui/DataTable';
import { FormErrorSummary, FormGrid, MoneyInput, TextArea, TextInput } from '../../ui/Form';
import { Card, DescriptionList, PageHeader } from '../../ui/Layout';
import { ConfirmDialog, Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { EligibilityNotice, LoanPositionSummary, OfferSummary, RequirementsChecklist, ScheduleTable, Timeline } from '../../features/applications/parts';

export function ClientApplications() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useResource<Paged<ApplicationSummary>>(`/api/applications?page=${page}&pageSize=20`);
  return (
    <>
      <PageHeader title="My applications" actions={<ButtonLink to="/client/apply" icon={<PlusCircle className="h-4 w-4" />}>New application</ButtonLink>} />
      <Card padded={false}>
        <DataTable caption="My applications" rows={data?.items} loading={loading} error={error} onRetry={reload} rowKey={row => row.id}
          onRowClick={row => navigate(`/client/applications/${row.id}`)}
          empty={{ title: 'No applications yet', action: <ButtonLink to="/client/apply">Start an application</ButtonLink> }}
          pagination={data && { page, pageSize: data.pageSize, total: data.total, onPage: setPage }}
          columns={[
            { key: 'product', header: 'Product', mobile: 'title', render: row => <>{row.productName}{row.businessName && <span className="block text-xs font-normal text-ink-muted">{row.businessName}</span>}</> },
            { key: 'reference', header: 'Reference', render: row => row.reference },
            { key: 'amount', header: 'Amount', align: 'right', render: row => money(row.approvedAmount ?? row.amount) },
            { key: 'date', header: 'Submitted', render: row => date(row.submittedAt) },
            { key: 'status', header: 'Status', render: row => <StatusBadge status={row.status} /> },
          ]} />
      </Card>
    </>
  );
}

const NEXT_STEP: Partial<Record<string, string>> = {
  draft: 'Upload the required documents, then submit your application.',
  submitted: 'Your application is waiting to be assigned to a loan officer.',
  under_review: 'A loan officer is reviewing your application and documents.',
  info_requested: 'Your loan officer needs more information. Update your application below and submit it again.',
  assessed: 'Your application has been assessed and is being finalised.',
  recommended: 'Your application is waiting for a credit decision.',
  approved: 'Your loan has been approved. Your offer will be ready soon.',
  offer_issued: 'Review your offer below and accept or decline it before it expires.',
  offer_accepted: 'You accepted the offer. Funds will be sent once the disbursement is confirmed.',
  disbursed: 'Your loan is active. Keep up with your repayments below.',
  closed: 'This loan has been fully repaid.',
  rejected: 'We were not able to approve this application.',
  withdrawn: 'You withdrew this application.',
  offer_declined: 'You declined the offer.',
};

export function ClientApplicationDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data: app, error, loading, reload, setData } = useResource<ApplicationDetail>(`/api/applications/${id}`);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'submit' | 'withdraw' | 'accept' | 'decline' | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!app) return loading ? <LoadingBlock /> : null;

  const run = async (path: string, body: unknown, success: string) => {
    setPending(true);
    setActionError(null);
    try {
      setData(await api<ApplicationDetail>(path, { body }));
      toast(success);
      setConfirm(null);
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught : new ApiError(0, 'Something went wrong.'));
      setConfirm(null);
    } finally {
      setPending(false);
    }
  };

  const can = (action: string) => app.allowedActions.includes(action);
  const openOffer = app.offers.find(offer => offer.status === 'issued');
  const acceptedOffer = app.offers.find(offer => offer.status === 'accepted');

  return (
    <>
      <PageHeader title={app.productName} back={{ to: '/client/applications', label: 'My applications' }}
        description={`${app.reference}${app.businessName ? ` · ${app.businessName}` : ''}`}
        meta={<StatusBadge status={app.status} />}
        actions={<>
          {can('edit') && <Button variant="secondary" onClick={() => setEditing(true)}>Edit details</Button>}
          {can('submit') && <Button onClick={() => setConfirm('submit')}>{app.status === 'info_requested' ? 'Resubmit' : 'Submit application'}</Button>}
        </>} />

      <div className="space-y-6">
        <Alert tone={app.status === 'rejected' ? 'danger' : app.status === 'info_requested' ? 'warning' : 'info'} title="What happens next">
          {NEXT_STEP[app.status]}
          {app.status === 'info_requested' && app.infoRequestNote && <p className="mt-2 font-medium">“{app.infoRequestNote}”</p>}
          {app.status === 'rejected' && app.decisionReason && <p className="mt-2">Reason: {app.decisionReason}</p>}
        </Alert>

        {actionError && <FormErrorSummary message={actionError.message} details={actionError.details} />}

        {openOffer && (
          <Card title="Your loan offer" actions={can('respond_offer') && <>
            <Button variant="secondary" onClick={() => setConfirm('decline')}>Decline</Button>
            <Button variant="success" onClick={() => setConfirm('accept')}>Accept offer</Button>
          </>}>
            <OfferSummary offer={openOffer} />
          </Card>
        )}

        {app.position && (
          <Card title="Loan balance"><LoanPositionSummary position={app.position} /></Card>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {['draft', 'info_requested', 'submitted', 'under_review', 'assessed', 'recommended', 'approved'].includes(app.status) && (
              <Card title="Documents" description="Each item is checked by a loan officer.">
                <RequirementsChecklist requirements={app.requirements} app={app} canUpload={can('upload_documents') || ['submitted', 'under_review', 'assessed'].includes(app.status)} onChanged={reload} />
              </Card>
            )}
            {app.schedule.length > 0 && <Card title="Repayment schedule"><ScheduleTable schedule={app.schedule} /></Card>}
            {acceptedOffer && !app.schedule.length && <Card title="Accepted offer"><OfferSummary offer={acceptedOffer} /></Card>}
            <Card title="Application details">
              <DescriptionList items={[
                { label: 'Amount requested', value: money(app.amount) },
                { label: 'Term', value: `${app.termMonths} months` },
                app.approvedAmount !== null && { label: 'Amount approved', value: money(app.approvedAmount) },
                { label: 'Purpose', value: app.purpose },
                app.declared.monthlyNetIncome !== undefined && { label: 'Monthly net income (declared)', value: money(app.declared.monthlyNetIncome) },
                app.declared.expectedProceeds !== undefined && { label: 'Invoice / order value', value: money(app.declared.expectedProceeds) },
                { label: 'Submitted', value: date(app.submittedAt) },
              ]} />
            </Card>
          </div>
          <div className="space-y-6">
            <EligibilityNotice eligibility={app.eligibility} membersOnly={app.product.membersOnly} />
            <Card title="History"><Timeline events={app.timeline} /></Card>
            {can('withdraw') && <Button variant="ghost" block onClick={() => setConfirm('withdraw')}>Withdraw application</Button>}
          </div>
        </div>
      </div>

      {editing && <EditApplication app={app} onClose={() => setEditing(false)} onSaved={updated => { setData(updated); setEditing(false); toast('Application updated.'); }} />}
      <ConfirmDialog open={confirm === 'submit'} onClose={() => setConfirm(null)} title="Submit application?" confirmLabel="Submit" pending={pending}
        onConfirm={() => run(`/api/applications/${app.id}/submit`, {}, 'Application submitted.')}
        message="Your details and documents will be sent to Pinnacle for review. You can still withdraw before a decision is made." />
      <ConfirmDialog open={confirm === 'withdraw'} onClose={() => setConfirm(null)} title="Withdraw application?" tone="danger" confirmLabel="Withdraw" pending={pending}
        onConfirm={() => run(`/api/applications/${app.id}/withdraw`, {}, 'Application withdrawn.')} message="This cannot be undone. You can start a new application later." />
      <ConfirmDialog open={confirm === 'accept'} onClose={() => setConfirm(null)} title="Accept this offer?" tone="success" confirmLabel="I accept" pending={pending}
        onConfirm={() => run(`/api/applications/${app.id}/offer/respond`, { accept: true }, 'Offer accepted.')}
        message={openOffer && `You agree to repay ${money(openOffer.totalRepayable)} over ${openOffer.termMonths} months on the terms shown.`} />
      <ConfirmDialog open={confirm === 'decline'} onClose={() => setConfirm(null)} title="Decline this offer?" tone="danger" confirmLabel="Decline offer" pending={pending}
        onConfirm={() => run(`/api/applications/${app.id}/offer/respond`, { accept: false }, 'Offer declined.')} />
    </>
  );
}

function EditApplication({ app, onClose, onSaved }: { app: ApplicationDetail; onClose: () => void; onSaved: (app: ApplicationDetail) => void }) {
  const [amount, setAmount] = useState<number | ''>(app.amount);
  const [termMonths, setTermMonths] = useState<number | ''>(app.termMonths);
  const [purpose, setPurpose] = useState(app.purpose ?? '');
  const [income, setIncome] = useState<number | ''>(app.declared.monthlyNetIncome ?? '');
  const [deductions, setDeductions] = useState<number | ''>(app.declared.existingMonthlyDeductions ?? '');
  const [proceeds, setProceeds] = useState<number | ''>(app.declared.expectedProceeds ?? '');
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const individual = app.borrowerType === 'individual';
  const usesProceeds = ['invoice_discounting', 'order_financing'].includes(app.product.category);

  const save = async () => {
    setPending(true);
    setError(null);
    const declared: Record<string, number> = {};
    if (individual && income !== '') declared.monthlyNetIncome = income;
    if (individual && deductions !== '') declared.existingMonthlyDeductions = deductions;
    if (usesProceeds && proceeds !== '') declared.expectedProceeds = proceeds;
    try {
      onSaved(await api<ApplicationDetail>(`/api/applications/${app.id}`, { method: 'PATCH', body: { amount, termMonths, purpose, declared } }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not save.'));
    } finally {
      setPending(false);
    }
  };
  const fieldErrors = error?.fieldErrors() ?? {};
  return (
    <Modal open onClose={onClose} title="Edit application" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Save</Button></>}>
      <div className="space-y-4">
        <FormErrorSummary message={error?.message} details={error?.details} visibleFields={['amount', 'termMonths']} />
        <FormGrid>
          <MoneyInput label="Amount" value={amount} onValueChange={setAmount} error={fieldErrors.amount} hint={`${money(app.product.minAmount)} to ${money(app.product.maxAmount)}`} />
          <TextInput label="Term (months)" type="number" inputMode="numeric" min={app.product.minTermMonths ?? 1} max={app.product.maxTermMonths ?? undefined}
            value={termMonths} onChange={event => setTermMonths(event.target.value === '' ? '' : Number(event.target.value))}
            error={fieldErrors.termMonths} hint={`${app.product.minTermMonths}–${app.product.maxTermMonths} months`} />
          {individual && <MoneyInput label="Monthly net income" value={income} onValueChange={setIncome} />}
          {individual && <MoneyInput label="Existing monthly loan deductions" value={deductions} onValueChange={setDeductions} />}
          {usesProceeds && <MoneyInput label="Invoice / order value" value={proceeds} onValueChange={setProceeds} />}
        </FormGrid>
        <TextArea label="Purpose" rows={3} value={purpose} onChange={event => setPurpose(event.target.value)} />
      </div>
    </Modal>
  );
}
