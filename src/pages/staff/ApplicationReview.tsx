import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { ApplicationDetail, AssessmentPreview, StoredDocument } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { date, dateTime, money, percent, titleCase } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button } from '../../ui/Button';
import { Alert, Badge, DemoBadge, ErrorState, LoadingBlock, StatusBadge } from '../../ui/Feedback';
import { FormErrorSummary, FormGrid, MoneyInput, Select, TextArea, TextInput } from '../../ui/Form';
import { Card, DescriptionList, PageHeader, Tabs } from '../../ui/Layout';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { DocumentList } from '../../features/documents/Documents';
import { EligibilityNotice, LoanPositionSummary, OfferSummary, RequirementsChecklist, ScheduleTable, Timeline } from '../../features/applications/parts';

type TabId = 'summary' | 'documents' | 'assessment' | 'loan' | 'history';
type Dialog = null | 'assign' | 'request_info' | 'recommend' | 'approve' | 'reject' | 'issue_offer' | 'record_disbursement' | 'record_repayment';

const FIGURE_LABELS: Record<string, string> = {
  proposedInstallment: 'Proposed installment', monthlyNetIncome: 'Monthly net income', existingMonthlyDeductions: 'Existing monthly deductions',
  avgMonthlyRevenue: 'Average monthly revenue', avgMonthlyCostOfSales: 'Cost of sales / month', avgMonthlyOperatingExpenses: 'Operating expenses / month',
  existingMonthlyDebtService: 'Existing debt service / month', largestCustomerShare: 'Largest customer share', expectedProceeds: 'Invoice / order value',
};
const RESULT_LABELS: Record<string, string> = {
  debtServiceRatio: 'Debt service ratio', disposableIncomeAfterLoan: 'Income left after repayments', netOperatingCashFlow: 'Net operating cash flow / month',
  debtServiceCoverage: 'Debt service coverage', installmentToRevenue: 'Installment ÷ revenue', monthsTrading: 'Months trading', proceedsCoverage: 'Proceeds ÷ total repayable',
};
const SOURCE_TONES = { verified: 'success', applicant: 'warning', estimated: 'info', missing: 'danger' } as const;

function formatResult(key: string, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (['debtServiceRatio', 'installmentToRevenue'].includes(key)) return percent(value);
  if (['debtServiceCoverage', 'proceedsCoverage'].includes(key)) return `${value.toFixed(2)}×`;
  if (key === 'monthsTrading') return `${value}`;
  return money(value);
}

function formatFigure(key: string, value: number | null): string {
  if (value === null) return '—';
  return key === 'largestCustomerShare' ? percent(value) : money(value);
}

export function ApplicationReview() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: app, error, loading, reload, setData } = useResource<ApplicationDetail>(`/api/applications/${id}`);
  const [tab, setTab] = useState<TabId>('summary');
  const [dialog, setDialog] = useState<Dialog>(null);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!app) return loading ? <LoadingBlock /> : null;
  const allowed = (action: string) => app.allowedActions.includes(action);
  const done = (updated?: ApplicationDetail) => { setDialog(null); if (updated) setData(updated); else void reload(); };

  const primaryActions: Array<{ id: Dialog; label: string; variant?: 'primary' | 'secondary' | 'success' | 'danger' }> = [
    { id: 'assign', label: app.assignedOfficerId ? 'Reassign' : 'Assign', variant: 'secondary' },
    { id: 'request_info', label: 'Request information', variant: 'secondary' },
    { id: 'recommend', label: 'Recommend' },
    { id: 'reject', label: 'Reject', variant: 'danger' },
    { id: 'approve', label: 'Approve', variant: 'success' },
    { id: 'issue_offer', label: 'Issue offer' },
    { id: 'record_disbursement', label: 'Record disbursement' },
    { id: 'record_repayment', label: 'Record repayment' },
  ];
  const visibleActions = primaryActions.filter(action => allowed(action.id!));
  const openOffer = app.offers.find(offer => offer.status === 'issued' || offer.status === 'accepted');
  const latest = app.assessments[0];

  return (
    <>
      <PageHeader title={app.applicantName} back={{ to: '/staff/applications', label: 'Applications' }}
        description={`${app.reference} · ${app.productName} · ${money(app.amount)} over ${app.termMonths} months`}
        meta={<><StatusBadge status={app.status} /><Badge>{app.borrowerType === 'business' ? 'Business' : 'Individual'}</Badge><DemoBadge show={app.isDemo} />
          <span className="text-sm text-ink-muted">Officer: {app.assignedOfficerName ?? 'unassigned'}</span></>}
        actions={visibleActions.map(action => <Button key={action.id} variant={action.variant} onClick={() => setDialog(action.id)}>{action.label}</Button>)} />

      {app.status === 'recommended' && (
        <div className="mb-4">
          <Alert tone={app.recommendation === 'approve' ? 'success' : 'warning'} title={`Recommended to ${app.recommendation} by ${app.recommendedBy ?? 'officer'}`}>{app.recommendationNote}</Alert>
          {!allowed('approve') && can('applications.approve') && <p className="mt-2 text-sm text-ink-muted">You can’t approve this one: either you assessed or recommended it, or it exceeds your approval limit.</p>}
        </div>
      )}
      {app.status === 'info_requested' && app.infoRequestNote && <div className="mb-4"><Alert tone="warning" title="Waiting for the applicant">{app.infoRequestNote}</Alert></div>}

      <Tabs label="Application sections" value={tab} onChange={setTab} tabs={[
        { id: 'summary', label: 'Summary' },
        { id: 'documents', label: 'Documents', count: app.requirements.filter(item => item.status !== 'verified').length || undefined },
        { id: 'assessment', label: 'Assessment', count: app.assessments.length || undefined },
        { id: 'loan', label: 'Offer & loan' },
        { id: 'history', label: 'History' },
      ]} />

      {tab === 'summary' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title="Request">
              <DescriptionList items={[
                { label: 'Product', value: app.productName },
                { label: 'Amount', value: money(app.amount) },
                { label: 'Term', value: `${app.termMonths} months (${app.product.repaymentFrequency === 'bullet' ? 'single repayment' : 'monthly'})` },
                { label: 'Rate at submission', value: app.interestRateMonthly !== null ? `${app.interestRateMonthly}% per month` : '—' },
                { label: 'Purpose', value: app.purpose },
                { label: 'Submitted', value: dateTime(app.submittedAt) },
                app.approvedAmount !== null && { label: 'Approved', value: `${money(app.approvedAmount)} over ${app.approvedTermMonths} months` },
                app.decisionReason && { label: 'Decision reason', value: app.decisionReason },
              ]} />
            </Card>
            <Card title="Applicant declared">
              {Object.keys(app.declared).length === 0 ? <p className="text-sm text-ink-muted">Nothing declared.</p> : (
                <DescriptionList items={Object.entries(app.declared).map(([key, value]) => ({
                  label: FIGURE_LABELS[key] ?? titleCase(key.replace(/([A-Z])/g, '_$1').toLowerCase()),
                  value: typeof value === 'number' ? (key === 'largestCustomerShare' ? percent(value) : money(value)) : String(value),
                }))} />
              )}
              <p className="mt-3 text-xs text-ink-subtle">Applicant-provided. Verify against documents before relying on these figures.</p>
            </Card>
          </div>
          <div className="space-y-6">
            <EligibilityNotice eligibility={app.eligibility} membersOnly={app.product.membersOnly} />
            <Card title="Links">
              <ul className="space-y-2 text-sm">
                <li><Link className="font-semibold text-brand-700 hover:underline" to={`/staff/customers/${app.customerId}`}>Applicant profile</Link></li>
                {app.businessId && <li><Link className="font-semibold text-brand-700 hover:underline" to={`/staff/businesses/${app.businessId}`}>Business profile: {app.businessName}</Link></li>}
              </ul>
            </Card>
            {latest && (
              <Card title="Latest assessment">
                <ul className="space-y-1.5 text-sm">
                  {latest.indicators.length === 0 && <li className="text-ink-muted">No risk indicators flagged.</li>}
                  {latest.indicators.map(indicator => <li key={indicator.code}><Badge tone={indicator.severity === 'concern' ? 'danger' : indicator.severity === 'caution' ? 'warning' : 'info'}>{indicator.severity}</Badge> <span className="text-ink">{indicator.message}</span></li>)}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="space-y-6">
          <Card title="Required for this product"><RequirementsChecklist requirements={app.requirements} app={app} onChanged={reload} /></Card>
          <Card title="Application documents"><DocumentList owner={{ applicationId: app.id }} canReview={can('documents.verify')} canManage={can('applications.assess')} /></Card>
          <Card title="Applicant’s personal documents"><DocumentList owner={{ customerId: app.customerId }} canReview={can('documents.verify')} /></Card>
          {app.businessId && <Card title="Business documents"><DocumentList owner={{ businessId: app.businessId }} canReview={can('documents.verify')} /></Card>}
        </div>
      )}

      {tab === 'assessment' && (
        <div className="space-y-6">
          {allowed('assess') && <AssessmentForm app={app} onSaved={updated => { setData(updated); }} />}
          {app.assessments.length === 0 && !allowed('assess') && <Card><p className="text-sm text-ink-muted">No assessment recorded yet.</p></Card>}
          {app.assessments.map(assessment => (
            <Card key={assessment.id} title={`Assessment by ${assessment.assessedBy ?? 'officer'}`} description={dateTime(assessment.createdAt)}>
              <AssessmentView inputs={assessment.inputs} results={assessment.results} indicators={assessment.indicators} missing={assessment.missingInformation} />
              {assessment.officerSummary && <div className="mt-4 rounded-lg bg-surface-muted p-3 text-sm"><p className="font-semibold">Officer summary</p><p className="mt-1 whitespace-pre-wrap">{assessment.officerSummary}</p></div>}
            </Card>
          ))}
        </div>
      )}

      {tab === 'loan' && (
        <div className="space-y-6">
          {app.position && <Card title="Loan position"><LoanPositionSummary position={app.position} /></Card>}
          {openOffer && <Card title="Offer"><OfferSummary offer={openOffer} /></Card>}
          {!openOffer && app.offers.length === 0 && <Card><p className="text-sm text-ink-muted">No offer has been issued.</p></Card>}
          {app.transactions.length > 0 && (
            <Card title="Transactions">
              <ul className="divide-y divide-line">
                {app.transactions.map(txn => (
                  <li key={txn.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold text-ink">{titleCase(txn.type)} · {money(txn.amount)}</p>
                      <p className="text-ink-muted">{date(txn.valueDate)} · {titleCase(txn.channel)} · Ref {txn.externalReference}</p>
                      <p className="text-xs text-ink-subtle">Recorded by {txn.recordedBy}{txn.confirmedBy ? ` · ${txn.status === 'rejected' ? 'rejected' : 'confirmed'} by ${txn.confirmedBy}` : ''}</p>
                      {txn.rejectionReason && <p className="text-xs text-danger-700">{txn.rejectionReason}</p>}
                    </div>
                    <StatusBadge status={txn.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {app.schedule.length > 0 && <Card title="Repayment schedule"><ScheduleTable schedule={app.schedule} /></Card>}
        </div>
      )}

      {tab === 'history' && <Card><Timeline events={app.timeline} /></Card>}

      {dialog && <ActionDialog dialog={dialog} app={app} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}

export function AssessmentView({ inputs, results, indicators, missing, scenarios }: {
  inputs: Record<string, any>; results: Record<string, any>; indicators: AssessmentPreview['indicators']; missing: string[]; scenarios?: AssessmentPreview['scenarios'];
}) {
  const figureEntries = Object.entries(inputs).filter(([key]) => key !== 'overrides');
  const allScenarios = scenarios ?? results.scenarios ?? [];
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Figures used</h3>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {figureEntries.map(([key, figure]) => (
            <li key={key} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="text-ink">{FIGURE_LABELS[key] ?? key}{figure.note && <span className="block text-xs text-ink-subtle">{figure.note}</span>}</span>
              <span className="flex items-center gap-2"><span className="font-semibold tabular-nums">{formatFigure(key, figure.value)}</span><Badge tone={SOURCE_TONES[figure.source as keyof typeof SOURCE_TONES]}>{figure.source}</Badge></span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Calculated</h3>
        <DescriptionList columns={3} items={Object.entries(results).filter(([key]) => RESULT_LABELS[key]).map(([key, value]) => ({ label: RESULT_LABELS[key], value: formatResult(key, value as number | null) }))} />
      </div>
      {allScenarios.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Affordability at other terms</h3>
          <ul className="grid gap-2 sm:grid-cols-3">
            {allScenarios.map((scenario: any) => (
              <li key={scenario.termMonths} className="rounded-lg border border-line p-3 text-sm">
                <p className="font-semibold">{scenario.termMonths} months</p>
                <p className="text-ink-muted">{money(scenario.installment)} / month</p>
                <p className="text-ink-muted">{scenario.ratioLabel}: {scenario.ratio === null ? '—' : scenario.ratioLabel.includes('coverage') ? `${scenario.ratio.toFixed(2)}×` : percent(scenario.ratio)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {indicators.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Risk indicators</h3>
          <ul className="space-y-1.5">
            {indicators.map(indicator => (
              <li key={indicator.code} className="flex items-start gap-2 text-sm">
                <Badge tone={indicator.severity === 'concern' ? 'danger' : indicator.severity === 'caution' ? 'warning' : 'info'}>{indicator.severity}</Badge>
                <span className="min-w-0 text-ink">{indicator.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {missing.length > 0 && (
        <Alert tone="warning" title="Missing or unverified information">
          <ul className="list-disc space-y-0.5 pl-5">{missing.map(item => <li key={item}>{item}</li>)}</ul>
        </Alert>
      )}
      <p className="text-xs text-ink-subtle">These calculations support your judgement. They never approve or reject an application.</p>
    </div>
  );
}

function AssessmentForm({ app, onSaved }: { app: ApplicationDetail; onSaved: (app: ApplicationDetail) => void }) {
  const toast = useToast();
  const [preview, setPreview] = useState<AssessmentPreview | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { value: number | ''; note: string; evidenceDocumentId: string }>>({});
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const individual = app.borrowerType === 'individual';
  const verifiableKeys = individual ? ['monthlyNetIncome', 'existingMonthlyDeductions'] : (['invoice_discounting', 'order_financing'].includes(app.product.category) ? ['expectedProceeds'] : []);

  useEffect(() => {
    const owners = [`applicationId=${app.id}`, `customerId=${app.customerId}`, ...(app.businessId ? [`businessId=${app.businessId}`] : [])];
    Promise.all(owners.map(owner => api<StoredDocument[]>(`/api/documents?${owner}`))).then(lists => setDocs(lists.flat().filter(doc => doc.status === 'verified'))).catch(() => undefined);
  }, [app.id, app.customerId, app.businessId]);

  const cleanOverrides = () => Object.fromEntries(Object.entries(overrides)
    .filter(([, value]) => value.value !== '')
    .map(([key, value]) => [key, { value: Number(value.value), note: value.note || 'Verified against document', evidenceDocumentId: value.evidenceDocumentId || undefined }]));

  useEffect(() => {
    const timer = setTimeout(() => {
      api<AssessmentPreview>(`/api/applications/${app.id}/assessment-preview`, { body: { overrides: cleanOverrides() } }).then(setPreview).catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, JSON.stringify(overrides)]);

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ application: ApplicationDetail }>(`/api/applications/${app.id}/assess`, { body: { overrides: cleanOverrides(), officerSummary: summary } });
      toast('Assessment recorded.');
      setSummary('');
      onSaved(result.application);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not save the assessment.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card title="New assessment" description={app.borrowerType === 'business' ? 'Business figures come from the business profile. Record verified figures there (Financials tab) to replace applicant-declared ones.' : 'Enter verified figures where you have checked them against a document.'}>
      <div className="space-y-5">
        {verifiableKeys.map(key => (
          <div key={key} className="rounded-lg border border-line p-3">
            <p className="mb-2 text-sm font-semibold text-ink">{FIGURE_LABELS[key]} — verified value</p>
            <FormGrid columns={3}>
              <MoneyInput label="Verified amount" value={overrides[key]?.value ?? ''} onValueChange={value => setOverrides(current => ({ ...current, [key]: { note: '', evidenceDocumentId: '', ...current[key], value } }))} />
              <Select label="Evidence document" value={overrides[key]?.evidenceDocumentId ?? ''} placeholder="Choose a verified document…"
                onChange={event => setOverrides(current => ({ ...current, [key]: { value: '', note: '', ...current[key], evidenceDocumentId: event.target.value } }))}
                options={docs.map(doc => ({ value: doc.id, label: `${doc.documentTypeLabel} — ${doc.fileName}` }))} />
              <TextInput label="Note" value={overrides[key]?.note ?? ''} onChange={event => setOverrides(current => ({ ...current, [key]: { value: '', evidenceDocumentId: '', ...current[key], note: event.target.value } }))} />
            </FormGrid>
          </div>
        ))}
        {preview ? <AssessmentView inputs={preview.inputs} results={preview.results} indicators={preview.indicators} missing={preview.missingInformation} scenarios={preview.scenarios} /> : <p className="text-sm text-ink-muted">Calculating…</p>}
        <TextArea label="Your assessment" required rows={5} value={summary} onChange={event => setSummary(event.target.value)} hint="Explain repayment capacity, risks and mitigants in your own words." />
        <FormErrorSummary message={error?.message} details={error?.details} />
        <div className="flex justify-end"><Button onClick={save} loading={pending} disabled={summary.trim().length < 10}>Save assessment</Button></div>
      </div>
    </Card>
  );
}

function ActionDialog({ dialog, app, onClose, onDone }: { dialog: Exclude<Dialog, null>; app: ApplicationDetail; onClose: () => void; onDone: (app?: ApplicationDetail) => void }) {
  const toast = useToast();
  const staff = useResource<Array<{ id: string; fullName: string; role: string; staffTitle: string | null }>>(dialog === 'assign' ? '/api/staff/directory' : null);
  const [officerId, setOfficerId] = useState(app.assignedOfficerId ?? '');
  const [note, setNote] = useState('');
  const [recommendation, setRecommendation] = useState<'approve' | 'decline'>('approve');
  const [approvedAmount, setApprovedAmount] = useState<number | ''>(app.amount);
  const [approvedTerm, setApprovedTerm] = useState<number | ''>(app.termMonths);
  const offer = app.offers.find(item => item.status === 'accepted');
  const [txn, setTxn] = useState({ amount: (dialog === 'record_disbursement' ? offer?.schedule.netDisbursement : app.position?.nextDue?.amount) ?? ('' as number | ''), valueDate: new Date().toISOString().slice(0, 10), channel: 'bank_transfer', externalReference: '', notes: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  const config: Record<string, { title: string; label: string; tone?: 'primary' | 'success' | 'danger'; run: () => Promise<ApplicationDetail | void> }> = {
    assign: { title: 'Assign application', label: 'Assign', run: () => api(`/api/applications/${app.id}/assign`, { body: { officerId } }) },
    request_info: { title: 'Request information from applicant', label: 'Send request', run: () => api(`/api/applications/${app.id}/request-info`, { body: { note } }) },
    recommend: { title: 'Recommendation', label: 'Submit recommendation', run: () => api(`/api/applications/${app.id}/recommend`, { body: { recommendation, note } }) },
    approve: { title: 'Approve application', label: 'Approve', tone: 'success', run: () => api(`/api/applications/${app.id}/approve`, { body: { reason: note, approvedAmount: approvedAmount === '' ? undefined : approvedAmount, approvedTermMonths: approvedTerm === '' ? undefined : approvedTerm } }) },
    reject: { title: 'Reject application', label: 'Reject', tone: 'danger', run: () => api(`/api/applications/${app.id}/reject`, { body: { reason: note } }) },
    issue_offer: { title: 'Issue loan offer', label: 'Issue offer', run: () => api(`/api/applications/${app.id}/offer`, { body: { conditions: note || undefined } }) },
    record_disbursement: { title: 'Record disbursement', label: 'Record for confirmation', run: async () => { await api(`/api/applications/${app.id}/transactions`, { body: { type: 'disbursement', ...txn, notes: txn.notes || undefined } }); } },
    record_repayment: { title: 'Record repayment', label: 'Record for confirmation', run: async () => { await api(`/api/applications/${app.id}/transactions`, { body: { type: 'repayment', ...txn, notes: txn.notes || undefined } }); } },
  };
  const current = config[dialog];

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await current.run();
      toast(dialog.startsWith('record_') ? 'Recorded. A colleague with confirmation rights must confirm it.' : 'Saved.');
      onDone(result || undefined);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Something went wrong.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={current.title} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={current.tone ?? 'primary'} onClick={submit} loading={pending}>{current.label}</Button></>}>
      <div className="space-y-4">
        <FormErrorSummary message={error?.message} details={error?.details} />
        {dialog === 'assign' && (
          <Select label="Officer" value={officerId} onChange={event => setOfficerId(event.target.value)} placeholder="Choose…"
            options={(staff.data ?? []).filter(member => member.role !== 'executive').map(member => ({ value: member.id, label: `${member.fullName}${member.staffTitle ? ` — ${member.staffTitle}` : ''}` }))}
            hint="Only officers authorised for this product and for assessments can be assigned." />
        )}
        {dialog === 'recommend' && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Recommendation</legend>
            {(['approve', 'decline'] as const).map(option => (
              <label key={option} className="flex items-center gap-2 text-sm"><input type="radio" className="h-4 w-4 accent-brand-600" checked={recommendation === option} onChange={() => setRecommendation(option)} /> {option === 'approve' ? 'Approve' : 'Decline'}</label>
            ))}
          </fieldset>
        )}
        {dialog === 'approve' && (
          <>
            <Alert tone="info">Approval requires every required document to be verified{app.product.membersOnly ? ', membership to be eligible' : ''}{app.businessId ? ' and the business to be verified' : ''}. Amounts above your approval limit are refused.</Alert>
            <FormGrid>
              <MoneyInput label="Approved amount" value={approvedAmount} onValueChange={setApprovedAmount} hint={`Requested ${money(app.amount)}`} />
              <TextInput label="Approved term (months)" type="number" value={approvedTerm} onChange={event => setApprovedTerm(event.target.value === '' ? '' : Number(event.target.value))} />
            </FormGrid>
          </>
        )}
        {['request_info', 'recommend', 'approve', 'reject', 'issue_offer'].includes(dialog) && (
          <TextArea label={dialog === 'request_info' ? 'What does the applicant need to provide?' : dialog === 'issue_offer' ? 'Conditions (optional)' : dialog === 'recommend' ? 'Reasons' : 'Decision reason'}
            required={dialog !== 'issue_offer'} rows={4} value={note} onChange={event => setNote(event.target.value)}
            hint={dialog === 'reject' ? 'The applicant will see this reason.' : dialog === 'request_info' ? 'Sent to the applicant.' : undefined} />
        )}
        {dialog === 'issue_offer' && <p className="text-sm text-ink-muted">The offer uses the approved amount and term with the rate and fees captured when the application was submitted.</p>}
        {(dialog === 'record_disbursement' || dialog === 'record_repayment') && (
          <>
            <Alert tone="info">This does not change the loan until a different authorised colleague confirms it against the {dialog === 'record_disbursement' ? 'bank or mobile money record' : 'payment record'}.</Alert>
            <FormGrid>
              <MoneyInput label="Amount" required value={txn.amount} onValueChange={value => setTxn({ ...txn, amount: value })}
                hint={dialog === 'record_disbursement' && offer ? `Net of deducted fees: ${money(offer.schedule.netDisbursement)}` : app.position ? `Outstanding ${money(app.position.outstandingTotal)}` : undefined} />
              <TextInput label="Value date" type="date" required value={txn.valueDate} max={new Date().toISOString().slice(0, 10)} onChange={event => setTxn({ ...txn, valueDate: event.target.value })} />
              <Select label="Channel" value={txn.channel} onChange={event => setTxn({ ...txn, channel: event.target.value })}
                options={['bank_transfer', 'mobile_money', 'payroll', 'cash', 'cheque'].map(value => ({ value, label: titleCase(value) }))} />
              <TextInput label="Transaction reference" required value={txn.externalReference} onChange={event => setTxn({ ...txn, externalReference: event.target.value })} hint="From the bank, mobile money or payroll record." />
            </FormGrid>
            <TextArea label="Notes" rows={2} value={txn.notes} onChange={event => setTxn({ ...txn, notes: event.target.value })} />
          </>
        )}
      </div>
    </Modal>
  );
}
