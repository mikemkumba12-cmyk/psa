import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, CheckCircle2, PlusCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { Business, BusinessDetail, Paged, StoredDocument } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { date, money, percent, ROLE_LABELS, titleCase } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button, ButtonLink } from '../../ui/Button';
import { Alert, Badge, DemoBadge, ErrorState, LoadingBlock, StatusBadge } from '../../ui/Feedback';
import { Checkbox, FormErrorSummary, FormGrid, MoneyInput, Select, TextArea, TextInput } from '../../ui/Form';
import { Card, DescriptionList, PageHeader, Tabs } from '../../ui/Layout';
import { ConfirmDialog, Modal } from '../../ui/Modal';
import { DataTable } from '../../ui/DataTable';
import { useToast } from '../../ui/Toast';
import { DocumentList } from '../documents/Documents';

const LEGAL_STRUCTURES = ['sole_proprietorship', 'partnership', 'private_limited', 'public_limited', 'cooperative', 'other'];
const SECTORS = ['Agriculture', 'Retail', 'Wholesale', 'Manufacturing', 'Construction', 'Transport', 'Hospitality', 'Services', 'Education', 'Health', 'Other'];
const BUSINESS_DOCS = ['business_registration', 'tax_clearance', 'bank_statement'];

// ── Form ─────────────────────────────────────────────────────────────────────

export function BusinessForm({ initial, onSaved, onCancel, askRole }: {
  initial?: Business; onSaved: (business: Business) => void; onCancel: () => void; askRole?: boolean;
}) {
  const [form, setForm] = useState({
    registeredName: initial?.registeredName ?? '', tradingName: initial?.tradingName ?? '', registrationNumber: initial?.registrationNumber ?? '',
    legalStructure: initial?.legalStructure ?? 'sole_proprietorship', tpin: initial?.tpin ?? '', sector: initial?.sector ?? '',
    district: initial?.district ?? '', physicalAddress: initial?.physicalAddress ?? '', dateEstablished: initial?.dateEstablished ?? '',
    employeeCount: initial?.employeeCount ?? ('' as number | ''), description: initial?.description ?? '',
    myRole: 'owner', ownershipPct: '' as number | '',
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(current => ({ ...current, [key]: event.target.value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const body: Record<string, unknown> = {
      registeredName: form.registeredName, tradingName: form.tradingName || undefined, registrationNumber: form.registrationNumber || undefined,
      legalStructure: form.legalStructure, tpin: form.tpin || undefined, sector: form.sector, district: form.district,
      physicalAddress: form.physicalAddress || undefined, dateEstablished: form.dateEstablished || null,
      employeeCount: form.employeeCount === '' ? null : Number(form.employeeCount), description: form.description || undefined,
    };
    if (!initial && askRole) { body.myRole = form.myRole; if (form.ownershipPct !== '') body.ownershipPct = form.ownershipPct; }
    try {
      onSaved(await api<Business>(initial ? `/api/businesses/${initial.id}` : '/api/businesses', { method: initial ? 'PATCH' : 'POST', body }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not save the business.'));
    } finally {
      setPending(false);
    }
  };
  const fieldErrors = error?.fieldErrors() ?? {};
  return (
    <form onSubmit={save} className="space-y-4">
      <FormErrorSummary message={error?.message} details={error?.details} visibleFields={Object.keys(form)} />
      {initial?.verificationStatus === 'verified' && <Alert tone="warning">Changing the name, registration number, TPIN or legal structure will require the business to be verified again.</Alert>}
      <FormGrid>
        <TextInput label="Registered name" required value={form.registeredName} onChange={set('registeredName')} error={fieldErrors.registeredName} />
        <TextInput label="Trading name" value={form.tradingName} onChange={set('tradingName')} />
        <Select label="Legal structure" value={form.legalStructure} onChange={set('legalStructure')} options={LEGAL_STRUCTURES.map(value => ({ value, label: titleCase(value) }))} />
        <TextInput label="Registration number" value={form.registrationNumber} onChange={set('registrationNumber')} error={fieldErrors.registrationNumber} />
        <TextInput label="TPIN" value={form.tpin} onChange={set('tpin')} error={fieldErrors.tpin} />
        <Select label="Sector" required value={form.sector} onChange={set('sector')} placeholder="Choose…" options={SECTORS.map(value => ({ value, label: value }))} error={fieldErrors.sector} />
        <TextInput label="District" required value={form.district} onChange={set('district')} error={fieldErrors.district} />
        <TextInput label="Date established" type="date" value={form.dateEstablished} onChange={set('dateEstablished')} />
        <TextInput label="Employees" type="number" inputMode="numeric" min={0} value={form.employeeCount} onChange={set('employeeCount')} />
        <TextInput label="Physical address" value={form.physicalAddress} onChange={set('physicalAddress')} />
        {!initial && askRole && (
          <>
            <Select label="Your role in the business" value={form.myRole} onChange={set('myRole')}
              options={['owner', 'director', 'representative'].map(value => ({ value, label: ROLE_LABELS[value] }))}
              hint={form.myRole === 'representative' ? 'You will need to upload an authorisation letter or board resolution.' : undefined} />
            {form.myRole !== 'representative' && <MoneyInput label="Your ownership (%)" value={form.ownershipPct} onValueChange={value => setForm(current => ({ ...current, ownershipPct: value }))} />}
          </>
        )}
      </FormGrid>
      <TextArea label="What does the business do?" rows={3} value={form.description} onChange={set('description')} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={pending}>{initial ? 'Save changes' : 'Create business profile'}</Button>
      </div>
    </form>
  );
}

// ── List (client) ────────────────────────────────────────────────────────────

export function ClientBusinessList() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useResource<Paged<Business>>('/api/businesses');
  return (
    <>
      <PageHeader title="My businesses" description="Businesses you own, direct or represent." actions={<ButtonLink to="/client/businesses/new" icon={<PlusCircle className="h-4 w-4" />}>Add business</ButtonLink>} />
      <Card padded={false}>
        <DataTable caption="My businesses" rows={data?.items} loading={loading} error={error} onRetry={reload} rowKey={row => row.id}
          onRowClick={row => navigate(`/client/businesses/${row.id}`)}
          empty={{ title: 'No businesses yet', description: 'Add your business to apply for SME financing.', action: <ButtonLink to="/client/businesses/new">Add business</ButtonLink> }}
          columns={[
            { key: 'name', header: 'Business', mobile: 'title', render: row => row.registeredName },
            { key: 'role', header: 'Your role', render: row => (row.myRoles ?? []).map(role => ROLE_LABELS[role]).join(', ') },
            { key: 'sector', header: 'Sector', render: row => row.sector },
            { key: 'status', header: 'Verification', render: row => <StatusBadge status={row.verificationStatus} /> },
          ]} />
      </Card>
    </>
  );
}

export function NewBusinessPage() {
  const navigate = useNavigate();
  const { isStaff } = useAuth();
  const base = isStaff ? '/staff/businesses' : '/client/businesses';
  return (
    <>
      <PageHeader title="Add a business" back={{ to: base, label: 'Businesses' }} />
      <Card><BusinessForm askRole={!isStaff} onCancel={() => navigate(base)} onSaved={business => navigate(`${base}/${business.id}`, { replace: true })} /></Card>
    </>
  );
}

// ── Detail (client and staff) ────────────────────────────────────────────────

export function BusinessDetailPage() {
  const { id } = useParams();
  const { isStaff, can, profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: business, error, loading, reload } = useResource<BusinessDetail>(`/api/businesses/${id}`);
  const [tab, setTab] = useState<'overview' | 'people' | 'financials' | 'documents' | 'applications'>('overview');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<'party' | 'financials' | null>(null);
  const [verifying, setVerifying] = useState<'verified' | 'rejected' | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!business) return loading ? <LoadingBlock /> : null;

  const base = isStaff ? '/staff/businesses' : '/client/businesses';
  const manageRoles = ['owner', 'director', 'representative'];
  const canManage = isStaff ? can('businesses.manage') : Boolean(business.myRoles?.some(role => manageRoles.includes(role)));
  const canVerify = isStaff && can('businesses.verify');

  const act = async (work: () => Promise<unknown>, success: string) => {
    setPending(true);
    setActionError(null);
    try { await work(); toast(success); await reload(); return true; }
    catch (caught) { setActionError(caught instanceof ApiError ? [caught.message, ...caught.details.map(detail => detail.message)].join(' ') : 'Something went wrong.'); return false; }
    finally { setPending(false); }
  };

  return (
    <>
      <PageHeader title={business.registeredName} back={{ to: base, label: 'Businesses' }}
        description={[business.tradingName, business.sector, business.district].filter(Boolean).join(' · ')}
        meta={<><StatusBadge status={business.verificationStatus} /><DemoBadge show={business.isDemo} /></>}
        actions={<>
          {canManage && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
          {!isStaff && canManage && ['unverified', 'rejected'].includes(business.verificationStatus) && (
            <Button loading={pending} onClick={() => act(() => api(`/api/businesses/${business.id}/submit-for-verification`, { method: 'POST' }), 'Sent for verification.')}>Request verification</Button>
          )}
          {canVerify && business.verificationStatus !== 'verified' && <Button variant="success" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setVerifying('verified')}>Verify</Button>}
          {canVerify && <Button variant="secondary" onClick={() => setVerifying('rejected')}>Reject</Button>}
        </>} />

      {actionError && <div className="mb-4"><Alert tone="danger">{actionError}</Alert></div>}
      {business.verificationStatus === 'rejected' && business.verificationNote && <div className="mb-4"><Alert tone="danger" title="Verification unsuccessful">{business.verificationNote}</Alert></div>}

      <Tabs label="Business sections" value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Overview' }, { id: 'people', label: 'People', count: business.parties.length },
        { id: 'financials', label: 'Financials', count: business.financials.length }, { id: 'documents', label: 'Documents' },
        { id: 'applications', label: 'Applications', count: business.applications.length },
      ]} />

      {tab === 'overview' && (
        <Card>
          <DescriptionList columns={3} items={[
            { label: 'Legal structure', value: titleCase(business.legalStructure) },
            { label: 'Registration number', value: business.registrationNumber },
            { label: 'TPIN', value: business.tpin },
            { label: 'Established', value: date(business.dateEstablished) },
            { label: 'Employees', value: business.employeeCount },
            { label: 'Address', value: business.physicalAddress },
            { label: 'Verified', value: business.verifiedAt ? `${date(business.verifiedAt)}${business.verifiedBy ? ` by ${business.verifiedBy}` : ''}` : 'Not yet' },
            { label: 'About', value: business.description },
          ]} />
        </Card>
      )}

      {tab === 'people' && (
        <Card title="Owners, directors and representatives" actions={canManage && <Button size="sm" icon={<PlusCircle className="h-4 w-4" />} onClick={() => setAdding('party')}>Add person</Button>} padded={false}>
          <ul className="divide-y divide-line">
            {business.parties.map(party => (
              <li key={party.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{party.name}{party.customerId === profile?.customer?.id ? ' (you)' : ''}</p>
                  <p className="text-sm text-ink-muted">{ROLE_LABELS[party.role]}{party.ownershipPct !== null ? ` · ${party.ownershipPct}%` : ''}{party.isSignatory ? ' · Signatory' : ''}{party.nationalId ? ` · ID ${party.nationalId}` : ''}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {party.verified ? <Badge tone="success">Link verified</Badge> : <Badge tone="warning">Link not verified</Badge>}
                    {party.membership ? <Badge tone={party.membership.status === 'active' && party.membership.verified ? 'success' : 'warning'}>Member {party.membership.memberNumber} · {party.membership.status}</Badge> : <Badge>Not a member</Badge>}
                    {party.role === 'representative' && <Badge tone={party.authorizationStatus === 'verified' ? 'success' : 'warning'}>Authorisation: {party.authorizationStatus ? titleCase(party.authorizationStatus) : 'none'}</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canVerify && <PartyVerifyButton businessId={business.id} party={party} onDone={reload} />}
                  {canManage && party.customerId !== profile?.customer?.id && (
                    <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} aria-label={`Remove ${party.name}`}
                      onClick={() => act(() => api(`/api/businesses/${business.id}/parties/${party.id}`, { method: 'DELETE' }), 'Person removed.')} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === 'financials' && (
        <Card title="Financial information" description="Applicant figures are declared by the business; verified figures are recorded by staff from documents."
          actions={(canManage || canVerify) && <Button size="sm" icon={<PlusCircle className="h-4 w-4" />} onClick={() => setAdding('financials')}>{isStaff ? 'Record verified figures' : 'Add figures'}</Button>} padded={false}>
          <DataTable caption="Business financials" rows={business.financials} rowKey={row => row.id}
            empty={{ title: 'No financial information yet', description: 'Average monthly revenue and expenses are needed for any SME application.' }}
            columns={[
              { key: 'period', header: 'Period', mobile: 'title', render: row => `${date(row.periodStart)} – ${date(row.periodEnd)}` },
              { key: 'source', header: 'Source', render: row => <Badge tone={row.source === 'verified' ? 'success' : 'neutral'}>{row.source === 'verified' ? 'Verified' : 'Applicant'}</Badge> },
              { key: 'revenue', header: 'Revenue / month', align: 'right', render: row => money(row.avgMonthlyRevenue) },
              { key: 'costs', header: 'Costs / month', align: 'right', render: row => money(row.avgMonthlyCostOfSales + row.avgMonthlyOperatingExpenses) },
              { key: 'debt', header: 'Debt service', align: 'right', render: row => money(row.existingMonthlyDebtService) },
              { key: 'concentration', header: 'Top customer', align: 'right', render: row => percent(row.largestCustomerShare) },
            ]} />
        </Card>
      )}

      {tab === 'documents' && (
        <Card title="Business documents">
          <DocumentList owner={{ businessId: business.id }} canManage={canManage} canReview={isStaff && can('documents.verify')} requiredTypes={BUSINESS_DOCS} />
        </Card>
      )}

      {tab === 'applications' && (
        <Card padded={false}>
          <DataTable caption="Applications" rows={business.applications} rowKey={row => row.id}
            empty={{ title: 'No applications yet', action: !isStaff ? <ButtonLink to="/client/apply">Apply for business financing</ButtonLink> : undefined }}
            onRowClick={row => navigate(`${isStaff ? '/staff' : '/client'}/applications/${row.id}`)}
            columns={[
              { key: 'product', header: 'Product', mobile: 'title', render: row => row.productName },
              { key: 'ref', header: 'Reference', render: row => row.reference },
              { key: 'amount', header: 'Amount', align: 'right', render: row => money(row.amount) },
              { key: 'status', header: 'Status', render: row => <StatusBadge status={row.status} /> },
            ]} />
        </Card>
      )}

      {editing && (
        <Modal open onClose={() => setEditing(false)} title="Edit business" size="lg">
          <BusinessForm initial={business} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); toast('Business updated.'); void reload(); }} />
        </Modal>
      )}
      {adding === 'party' && <AddPartyModal businessId={business.id} staff={isStaff} onClose={() => setAdding(null)} onDone={() => { setAdding(null); toast('Person added.'); void reload(); }} />}
      {adding === 'financials' && <FinancialsModal businessId={business.id} staff={isStaff} onClose={() => setAdding(null)} onDone={() => { setAdding(null); toast('Figures saved.'); void reload(); }} />}
      <ConfirmDialog open={Boolean(verifying)} onClose={() => setVerifying(null)} pending={pending}
        title={verifying === 'verified' ? 'Verify this business?' : 'Reject verification?'} tone={verifying === 'verified' ? 'success' : 'danger'}
        confirmLabel={verifying === 'verified' ? 'Verify business' : 'Reject'}
        message={verifying === 'verified' ? 'Confirm the registration certificate is verified and at least one owner or director has been checked.' : 'The owners will see your reason.'}
        onConfirm={async () => { if (await act(() => api(`/api/businesses/${business.id}/verify`, { body: { decision: verifying, note: note || undefined } }), verifying === 'verified' ? 'Business verified.' : 'Verification rejected.')) setVerifying(null); else setVerifying(null); }}>
        <TextArea label={verifying === 'rejected' ? 'Reason' : 'Note (optional)'} required={verifying === 'rejected'} rows={3} value={note} onChange={event => setNote(event.target.value)} />
      </ConfirmDialog>
    </>
  );
}

function PartyVerifyButton({ businessId, party, onDone }: { businessId: string; party: BusinessDetail['parties'][number]; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [authDoc, setAuthDoc] = useState(party.authorizationDocumentId ?? '');
  const [pending, setPending] = useState(false);
  const docs = useResource<StoredDocument[]>(open && party.role === 'representative' ? `/api/documents?businessId=${businessId}` : null);
  const submit = async (verified: boolean) => {
    setPending(true);
    try {
      await api(`/api/businesses/${businessId}/parties/${party.id}/verify`, { body: { verified, authorizationDocumentId: authDoc || undefined } });
      toast(verified ? 'Link verified.' : 'Verification removed.');
      setOpen(false);
      onDone();
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.message : 'Could not save.', 'error');
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Button size="sm" variant={party.verified ? 'secondary' : 'primary'} icon={party.verified ? <CheckCircle2 className="h-4 w-4" /> : undefined} onClick={() => setOpen(true)}>
        {party.verified ? 'Verified' : 'Verify link'}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Verify ${party.name}`} description={`${ROLE_LABELS[party.role]} of this business`}
        footer={<>
          {party.verified && <Button variant="secondary" onClick={() => submit(false)} loading={pending}>Remove verification</Button>}
          <Button variant="success" onClick={() => submit(true)} loading={pending}>Confirm verified</Button>
        </>}>
        <p className="text-sm text-ink-muted">Confirm you have checked this person’s identity and their {party.role === 'representative' ? 'authority to act for' : 'role in'} the business against the ownership documents.</p>
        {party.role === 'representative' && (
          <div className="mt-4">
            <Select label="Authorisation document" value={authDoc} onChange={event => setAuthDoc(event.target.value)} placeholder="Choose the authorisation letter…"
              options={(docs.data ?? []).filter(doc => doc.documentType === 'authorization_letter').map(doc => ({ value: doc.id, label: `${doc.fileName} (${doc.status})` }))}
              hint="Upload it under Documents first. It must also be verified." />
          </div>
        )}
      </Modal>
    </>
  );
}

function AddPartyModal({ businessId, staff, onClose, onDone }: { businessId: string; staff: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ fullName: '', nationalId: '', phone: '', role: 'director', ownershipPct: '' as number | '', isSignatory: false });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const save = async () => {
    setPending(true);
    setError(null);
    try {
      await api(`/api/businesses/${businessId}/parties`, { body: { fullName: form.fullName, nationalId: form.nationalId, phone: form.phone || undefined, role: form.role, ownershipPct: form.ownershipPct === '' ? undefined : form.ownershipPct, isSignatory: form.isSignatory } });
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not add the person.'));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Add a person" description={staff ? undefined : 'Staff will verify this person before they count for applications.'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Add</Button></>}>
      <div className="space-y-4">
        <FormErrorSummary message={error?.message} details={error?.details} />
        <FormGrid>
          <TextInput label="Full name" required value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} />
          <TextInput label="National ID number" required value={form.nationalId} onChange={event => setForm({ ...form, nationalId: event.target.value })} />
          <TextInput label="Phone" type="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} />
          <Select label="Role" value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}
            options={['owner', 'director', 'beneficial_owner', 'representative', 'guarantor'].map(value => ({ value, label: ROLE_LABELS[value] }))} />
          {['owner', 'beneficial_owner'].includes(form.role) && <MoneyInput label="Ownership (%)" value={form.ownershipPct} onValueChange={value => setForm({ ...form, ownershipPct: value })} />}
        </FormGrid>
        <Checkbox label="Authorised signatory" checked={form.isSignatory} onChange={value => setForm({ ...form, isSignatory: value })} />
      </div>
    </Modal>
  );
}

function FinancialsModal({ businessId, staff, onClose, onDone }: { businessId: string; staff: boolean; onClose: () => void; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsAgo = new Date(Date.now() - 182 * 86_400_000).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    periodStart: sixMonthsAgo, periodEnd: today, avgMonthlyRevenue: '' as number | '', avgMonthlyCostOfSales: '' as number | '',
    avgMonthlyOperatingExpenses: '' as number | '', existingMonthlyDebtService: '' as number | '', largestCustomerSharePct: '' as number | '',
    supportingDocumentId: '', notes: '',
  });
  const docs = useResource<StoredDocument[]>(staff ? `/api/documents?businessId=${businessId}` : null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const num = (value: number | '') => (value === '' ? 0 : value);
  const save = async () => {
    setPending(true);
    setError(null);
    try {
      await api(`/api/businesses/${businessId}/financials`, { body: {
        periodStart: form.periodStart, periodEnd: form.periodEnd, avgMonthlyRevenue: num(form.avgMonthlyRevenue),
        avgMonthlyCostOfSales: num(form.avgMonthlyCostOfSales), avgMonthlyOperatingExpenses: num(form.avgMonthlyOperatingExpenses),
        existingMonthlyDebtService: num(form.existingMonthlyDebtService),
        largestCustomerShare: form.largestCustomerSharePct === '' ? undefined : form.largestCustomerSharePct / 100,
        supportingDocumentId: form.supportingDocumentId || undefined, notes: form.notes || undefined,
      } });
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not save.'));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={staff ? 'Record verified figures' : 'Business figures'}
      description="Average monthly amounts over the period, e.g. from bank statements or accounts."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending} disabled={form.avgMonthlyRevenue === '' || (staff && !form.supportingDocumentId)}>Save</Button></>}>
      <div className="space-y-4">
        <FormErrorSummary message={error?.message} details={error?.details} />
        <FormGrid>
          <TextInput label="Period from" type="date" value={form.periodStart} onChange={event => setForm({ ...form, periodStart: event.target.value })} />
          <TextInput label="Period to" type="date" value={form.periodEnd} onChange={event => setForm({ ...form, periodEnd: event.target.value })} />
          <MoneyInput label="Average monthly revenue" required value={form.avgMonthlyRevenue} onValueChange={value => setForm({ ...form, avgMonthlyRevenue: value })} />
          <MoneyInput label="Cost of goods sold / month" value={form.avgMonthlyCostOfSales} onValueChange={value => setForm({ ...form, avgMonthlyCostOfSales: value })} />
          <MoneyInput label="Operating expenses / month" value={form.avgMonthlyOperatingExpenses} onValueChange={value => setForm({ ...form, avgMonthlyOperatingExpenses: value })} hint="Rent, wages, utilities, transport…" />
          <MoneyInput label="Existing loan repayments / month" value={form.existingMonthlyDebtService} onValueChange={value => setForm({ ...form, existingMonthlyDebtService: value })} />
          <TextInput label="Share of revenue from largest customer (%)" type="number" min={0} max={100} value={form.largestCustomerSharePct}
            onChange={event => setForm({ ...form, largestCustomerSharePct: event.target.value === '' ? '' : Number(event.target.value) })} />
          {staff && (
            <Select label="Supporting document" required value={form.supportingDocumentId} onChange={event => setForm({ ...form, supportingDocumentId: event.target.value })}
              placeholder="Choose a verified document…" options={(docs.data ?? []).filter(doc => doc.status === 'verified').map(doc => ({ value: doc.id, label: `${doc.documentTypeLabel} — ${doc.fileName}` }))} />
          )}
        </FormGrid>
        <TextArea label="Notes" rows={2} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />
      </div>
    </Modal>
  );
}

// ── Staff list ───────────────────────────────────────────────────────────────

export function StaffBusinessList() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), ...(search ? { search } : {}), ...(status ? { verificationStatus: status } : {}) }).toString();
  const { data, error, loading, reload } = useResource<Paged<Business>>(`/api/businesses?${query}`);
  return (
    <>
      <PageHeader title="SME businesses" description="Business profiles, linked people and verification."
        actions={can('businesses.manage') && <ButtonLink to="/staff/businesses/new" icon={<Building2 className="h-4 w-4" />}>Add business</ButtonLink>} />
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <TextInput label="Search" placeholder="Name, registration number or TPIN" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} fieldClassName="flex-1" />
          <Select label="Verification" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} placeholder="All"
            options={['pending_verification', 'verified', 'unverified', 'rejected'].map(value => ({ value, label: titleCase(value) }))} fieldClassName="sm:w-56" />
        </div>
        <DataTable caption="Businesses" rows={data?.items} loading={loading} error={error} onRetry={reload} rowKey={row => row.id}
          onRowClick={row => navigate(`/staff/businesses/${row.id}`)} empty={{ title: 'No businesses match' }}
          pagination={data && { page, pageSize: data.pageSize, total: data.total, onPage: setPage }}
          columns={[
            { key: 'name', header: 'Business', mobile: 'title', render: row => <>{row.registeredName} <DemoBadge show={row.isDemo} /></> },
            { key: 'reg', header: 'Registration', render: row => row.registrationNumber ?? '—' },
            { key: 'sector', header: 'Sector', render: row => row.sector },
            { key: 'district', header: 'District', render: row => row.district },
            { key: 'status', header: 'Verification', render: row => <StatusBadge status={row.verificationStatus} /> },
          ]} />
      </Card>
    </>
  );
}
