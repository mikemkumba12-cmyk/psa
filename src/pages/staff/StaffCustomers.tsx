import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Upload, UserPlus } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { CustomerSummary, Eligibility, Paged } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { date, money, ROLE_LABELS, titleCase } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button } from '../../ui/Button';
import { Alert, Badge, DemoBadge, ErrorState, LoadingBlock, StatusBadge } from '../../ui/Feedback';
import { DataTable } from '../../ui/DataTable';
import { FormErrorSummary, FormGrid, MoneyInput, Select, TextArea, TextInput } from '../../ui/Form';
import { Card, DescriptionList, PageHeader } from '../../ui/Layout';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { DocumentList } from '../../features/documents/Documents';

export function StaffCustomers() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [membership, setMembership] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const query = new URLSearchParams({ page: String(page), ...(search ? { search } : {}), ...(membership ? { membership } : {}) }).toString();
  const { data, error, loading, reload } = useResource<Paged<CustomerSummary>>(`/api/customers?${query}`);

  return (
    <>
      <PageHeader title="Customers" description="Individual customer profiles and their membership."
        actions={can('customers.manage') && <>
          <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => setImporting(true)}>Import CSV</Button>
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add customer</Button>
        </>} />
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <TextInput label="Search" placeholder="Name, national ID, phone, email or member number" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} fieldClassName="flex-1" />
          <Select label="Membership" value={membership} onChange={event => { setMembership(event.target.value); setPage(1); }} placeholder="Everyone" fieldClassName="sm:w-48"
            options={[{ value: 'member', label: 'Active members' }, { value: 'pending', label: 'Pending verification' }, { value: 'none', label: 'Not members' }]} />
        </div>
        <DataTable caption="Customers" rows={data?.items} loading={loading} error={error} onRetry={reload} rowKey={row => row.id}
          onRowClick={row => navigate(`/staff/customers/${row.id}`)} empty={{ title: 'No customers match' }}
          pagination={data && { page, pageSize: data.pageSize, total: data.total, onPage: setPage }}
          columns={[
            { key: 'name', header: 'Name', mobile: 'title', render: row => <>{row.fullName} <DemoBadge show={row.isDemo} /></> },
            { key: 'nid', header: 'National ID', render: row => row.nationalId ?? '—' },
            { key: 'phone', header: 'Phone', render: row => row.phone ?? '—' },
            { key: 'member', header: 'Membership', render: row => row.membership ? <StatusBadge status={row.membership.status} label={`${row.membership.memberNumber} · ${titleCase(row.membership.status)}`} /> : <span className="text-ink-subtle">None</span> },
            { key: 'apps', header: 'Applications', align: 'right', render: row => row.applicationCount ?? 0 },
            { key: 'portal', header: 'Portal', render: row => row.hasPortalAccount ? 'Active' : 'Not activated' },
          ]} />
      </Card>
      {adding && <CustomerFormModal onClose={() => setAdding(false)} onSaved={id => { setAdding(false); navigate(`/staff/customers/${id}`); }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { void reload(); }} />}
    </>
  );
}

function CustomerFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [form, setForm] = useState({ fullName: '', nationalId: '', phone: '', email: '', district: '', address: '', employerName: '', employeeNumber: '', monthlyIncome: '' as number | '', segment: 'individual' });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''));
      const result = await api<{ id: string }>('/api/customers', { body });
      onSaved(result.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not save.'));
    } finally {
      setPending(false);
    }
  };
  const fieldErrors = error?.fieldErrors() ?? {};
  return (
    <Modal open onClose={onClose} title="Add customer" size="lg" description="For walk-in or existing clients. They can activate a portal login later."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Save</Button></>}>
      <div className="space-y-4">
        <FormErrorSummary message={error?.message} details={error?.details} visibleFields={Object.keys(form)} />
        <FormGrid>
          <TextInput label="Full name" required value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} error={fieldErrors.fullName} />
          <TextInput label="National ID" required value={form.nationalId} onChange={event => setForm({ ...form, nationalId: event.target.value })} error={fieldErrors.nationalId} />
          <TextInput label="Phone" type="tel" required value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} error={fieldErrors.phone} />
          <TextInput label="Email" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} error={fieldErrors.email} />
          <TextInput label="District" value={form.district} onChange={event => setForm({ ...form, district: event.target.value })} />
          <TextInput label="Address" value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} />
          <TextInput label="Employer" value={form.employerName} onChange={event => setForm({ ...form, employerName: event.target.value })} />
          <TextInput label="Employee number" value={form.employeeNumber} onChange={event => setForm({ ...form, employeeNumber: event.target.value })} />
          <MoneyInput label="Monthly net income" value={form.monthlyIncome} onValueChange={value => setForm({ ...form, monthlyIncome: value })} />
          <Select label="Segment" value={form.segment} onChange={event => setForm({ ...form, segment: event.target.value })} options={[{ value: 'individual', label: 'Individual' }, { value: 'sme', label: 'SME' }]} />
        </FormGrid>
      </div>
    </Modal>
  );
}

/** CSV columns: fullName, nationalId, phone, email, district, employerName, employeeNumber, monthlyIncome. */
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map(key => key.trim());
  return body.map(values => Object.fromEntries(keys.map((key, index) => [key, (values[index] ?? '').trim()])));
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [results, setResults] = useState<Array<{ row: number; status: string; message?: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const onFile = async (file?: File) => {
    setResults(null);
    setError(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Use a file under 2 MB (about 1,000 rows).'); return; }
    const parsed = parseCsv(await file.text());
    if (!parsed.length) { setError('No rows found. The first line must be the column headings.'); return; }
    if (parsed.length > 1000) { setError('Import at most 1,000 rows at a time.'); return; }
    setRows(parsed);
  };
  const submit = async () => {
    setPending(true);
    try {
      const response = await api<{ results: Array<{ row: number; status: string; message?: string }>; created: number }>('/api/customers/import', { body: { rows } });
      setResults(response.results);
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Import failed.');
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Import customers from CSV" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button>{!results && <Button onClick={submit} loading={pending} disabled={!rows.length}>Import {rows.length || ''} rows</Button>}</>}>
      <div className="space-y-4 text-sm">
        <p className="text-ink-muted">Columns: <code className="break-words">fullName, nationalId, phone, email, district, employerName, employeeNumber, monthlyIncome</code>. Each row is validated; rows with a national ID already on file are skipped.</p>
        <input type="file" accept=".csv,text/csv" onChange={event => onFile(event.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-800" />
        {error && <Alert tone="danger">{error}</Alert>}
        {rows.length > 0 && !results && <p>{rows.length} rows ready. First row: {rows[0].fullName} ({rows[0].nationalId})</p>}
        {results && (
          <>
            <Alert tone="success">{results.filter(item => item.status === 'created').length} created, {results.filter(item => item.status === 'skipped').length} skipped, {results.filter(item => item.status === 'invalid').length} invalid.</Alert>
            <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {results.filter(item => item.status !== 'created').map(item => <li key={item.row} className="p-2"><Badge tone={item.status === 'invalid' ? 'danger' : 'warning'}>Row {item.row}</Badge> {item.message}</li>)}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

interface CustomerDetail extends CustomerSummary {
  address: string | null; dateOfBirth: string | null; gender: string | null; employmentType: string | null;
  eligibility: Eligibility;
  businesses: Array<{ id: string; name: string; verificationStatus: string; role: string; linkVerified: boolean }>;
  applications: Array<{ id: string; reference: string; status: string; amount: number; productName: string; submittedAt: string | null }>;
}

export function StaffCustomerDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data: customer, error, loading, reload } = useResource<CustomerDetail>(`/api/customers/${id}`);
  const [memberDialog, setMemberDialog] = useState(false);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!customer) return loading ? <LoadingBlock /> : null;
  return (
    <>
      <PageHeader title={customer.fullName} back={{ to: '/staff/customers', label: 'Customers' }}
        meta={<><Badge>{customer.segment === 'sme' ? 'SME' : 'Individual'}</Badge><DemoBadge show={customer.isDemo} />{!customer.hasPortalAccount && <Badge tone="warning">No portal login</Badge>}</>}
        actions={can('members.manage') && <Button variant="secondary" onClick={() => setMemberDialog(true)}>{customer.membership ? 'Update membership' : 'Register membership'}</Button>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Profile">
            <DescriptionList items={[
              { label: 'National ID', value: customer.nationalId }, { label: 'Phone', value: customer.phone }, { label: 'Email', value: customer.email },
              { label: 'District', value: customer.district }, { label: 'Address', value: customer.address }, { label: 'Date of birth', value: date(customer.dateOfBirth) },
              { label: 'Employer', value: customer.employerName }, { label: 'Employee number', value: customer.employeeNumber },
              { label: 'Monthly income (declared)', value: money(customer.monthlyIncome) }, { label: 'Customer since', value: date(customer.createdAt) },
            ]} />
          </Card>
          <Card title="Documents"><DocumentList owner={{ customerId: customer.id }} canReview={can('documents.verify')} canManage={can('customers.manage')} /></Card>
          <Card title="Applications" padded={false}>
            <DataTable caption="Applications" rows={customer.applications} rowKey={row => row.id} onRowClick={row => navigate(`/staff/applications/${row.id}`)} empty={{ title: 'No applications' }}
              columns={[
                { key: 'product', header: 'Product', mobile: 'title', render: row => row.productName },
                { key: 'ref', header: 'Reference', render: row => row.reference },
                { key: 'amount', header: 'Amount', align: 'right', render: row => money(row.amount) },
                { key: 'status', header: 'Status', render: row => <StatusBadge status={row.status} /> },
              ]} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Membership">
            {customer.membership ? (
              <DescriptionList columns={1} items={[
                { label: 'Member number', value: customer.membership.memberNumber },
                { label: 'Status', value: <StatusBadge status={customer.membership.status} /> },
                { label: 'Joined', value: date(customer.membership.joinedOn) },
                { label: 'Verified', value: customer.membership.verifiedAt ? date(customer.membership.verifiedAt) : 'Not verified' },
              ]} />
            ) : <p className="text-sm text-ink-muted">Not registered as a member.</p>}
            {!customer.eligibility.eligible && <div className="mt-3"><Alert tone="warning" title="Not currently eligible">{customer.eligibility.reasons.join(' ')}</Alert></div>}
            {!customer.eligibility.policyConfirmed && <p className="mt-3 text-xs text-ink-subtle">Membership rules are placeholders until confirmed by the institution.</p>}
          </Card>
          <Card title="Businesses">
            {customer.businesses.length === 0 ? <p className="text-sm text-ink-muted">Not linked to any business.</p> : (
              <ul className="space-y-2 text-sm">
                {customer.businesses.map(business => (
                  <li key={`${business.id}-${business.role}`}>
                    <Link className="font-semibold text-brand-700 hover:underline" to={`/staff/businesses/${business.id}`}>{business.name}</Link>
                    <span className="block text-ink-muted">{ROLE_LABELS[business.role]} · {business.linkVerified ? 'link verified' : 'link not verified'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {memberDialog && <MembershipDialog customer={customer} onClose={() => setMemberDialog(false)} onDone={() => { setMemberDialog(false); void reload(); }} />}
    </>
  );
}

function MembershipDialog({ customer, onClose, onDone }: { customer: CustomerDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const existing = customer.membership;
  const [memberNumber, setMemberNumber] = useState(existing?.memberNumber ?? '');
  const [joinedOn, setJoinedOn] = useState(existing?.joinedOn ?? '');
  const [status, setStatus] = useState<string>(existing?.status ?? 'active');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const save = async () => {
    setPending(true);
    setError(null);
    try {
      if (existing) await api(`/api/members/${existing.id}`, { method: 'PATCH', body: { memberNumber, joinedOn: joinedOn || undefined, status, reason } });
      else await api('/api/members', { body: { customerId: customer.id, memberNumber, joinedOn, status } });
      toast('Membership saved.');
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not save.'));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={existing ? 'Update membership' : 'Register membership'} description="Record only what you have checked against the institution’s membership register."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Save</Button></>}>
      <div className="space-y-4">
        <FormErrorSummary message={error?.message} details={error?.details} />
        <FormGrid>
          <TextInput label="Member number" required value={memberNumber} onChange={event => setMemberNumber(event.target.value)} />
          <TextInput label="Joined on" type="date" required={!existing} value={joinedOn ?? ''} onChange={event => setJoinedOn(event.target.value)} />
          <Select label="Status" value={status} onChange={event => setStatus(event.target.value)}
            options={(existing ? ['pending', 'active', 'suspended', 'terminated'] : ['active', 'pending']).map(value => ({ value, label: titleCase(value) }))} />
        </FormGrid>
        {existing && <TextArea label="Reason for change" required rows={2} value={reason} onChange={event => setReason(event.target.value)} />}
      </div>
    </Modal>
  );
}

export function StaffMembers() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useResource<Paged<any>>(`/api/members?page=${page}${status ? `&status=${status}` : ''}`);
  return (
    <>
      <PageHeader title="Member register" description="Memberships recorded and verified by staff. Customer-submitted numbers wait here until checked." />
      <Card padded={false}>
        <div className="border-b border-line p-4">
          <Select label="Status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} placeholder="All" fieldClassName="sm:w-56"
            options={['pending', 'active', 'suspended', 'terminated'].map(value => ({ value, label: titleCase(value) }))} />
        </div>
        <DataTable caption="Members" rows={data?.items} loading={loading} error={error} onRetry={reload} rowKey={row => row.id}
          onRowClick={row => navigate(`/staff/customers/${row.customerId}`)} empty={{ title: status === 'pending' ? 'Nothing waiting for verification' : 'No members' }}
          pagination={data && { page, pageSize: data.pageSize, total: data.total, onPage: setPage }}
          columns={[
            { key: 'name', header: 'Customer', mobile: 'title', render: row => <>{row.customerName} <DemoBadge show={row.isDemo} /></> },
            { key: 'number', header: 'Member number', render: row => row.memberNumber },
            { key: 'joined', header: 'Joined', render: row => date(row.joinedOn) },
            { key: 'verified', header: 'Verified by', render: row => row.verifiedBy ?? '—' },
            { key: 'status', header: 'Status', render: row => <StatusBadge status={row.status} /> },
          ]} />
      </Card>
    </>
  );
}
