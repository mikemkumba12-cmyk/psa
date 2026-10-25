import React, { useEffect, useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { dateTime, relative, titleCase } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button } from '../../ui/Button';
import { Alert, Badge, ErrorState, LoadingBlock, StatusBadge } from '../../ui/Feedback';
import { DataTable } from '../../ui/DataTable';
import { Checkbox, FormErrorSummary, FormGrid, Select, TextArea, TextInput } from '../../ui/Form';
import { Card, PageHeader, Stat, StatGrid, Tabs } from '../../ui/Layout';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

// ── Assistant knowledge base ─────────────────────────────────────────────────

interface KbDoc { id: string; title: string; sourceType: string; sourceReference: string | null; visibility: 'public' | 'staff'; status: string; body: string; version: number; createdBy: string | null; approvedBy: string | null; approvedAt: string | null; updatedAt: string; chunkCount: number }

export function StaffKnowledge() {
  const toast = useToast();
  const docs = useResource<KbDoc[]>('/api/knowledge');
  const stats = useResource<any>('/api/assistant/stats');
  const [editing, setEditing] = useState<KbDoc | 'new' | null>(null);
  const setStatus = async (doc: KbDoc, status: string) => {
    try {
      await api(`/api/knowledge/${doc.id}/status`, { body: { status } });
      toast(`"${doc.title}" is now ${status}.`);
      void docs.reload();
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.message : 'Could not update.', 'error');
    }
  };
  return (
    <>
      <PageHeader title="Assistant knowledge" description="The assistant answers policy questions only from approved documents here. Product figures always come from product settings."
        actions={<Button icon={<PlusCircle className="h-4 w-4" />} onClick={() => setEditing('new')}>Add document</Button>} />
      {stats.data && (
        <div className="mb-6 space-y-4">
          <StatGrid>
            <Stat label="Questions (30 days)" value={stats.data.totals.total} />
            <Stat label="Could not answer" value={stats.data.totals.unanswered} tone={stats.data.totals.unanswered ? 'warning' : undefined} hint="Candidates for new knowledge" />
            <Stat label="Errors" value={stats.data.totals.errors} tone={stats.data.totals.errors ? 'danger' : undefined} />
            <Stat label="Self-hosted model" value={stats.data.modelConfigured ? 'On' : 'Off'} hint={stats.data.modelConfigured ? 'Rewording only; numbers checked' : 'Answers use approved text as written'} />
          </StatGrid>
          {stats.data.recentUnanswered.length > 0 && (
            <Card title="Recent questions without an approved answer" description="Numbers are masked.">
              <ul className="space-y-1 text-sm">{stats.data.recentUnanswered.slice(0, 8).map((item: any, index: number) => <li key={index} className="break-words text-ink-muted">“{item.question_masked}” · {relative(item.created_at)}</li>)}</ul>
            </Card>
          )}
        </div>
      )}
      <Card padded={false}>
        <DataTable caption="Knowledge documents" rows={docs.data} loading={docs.loading} error={docs.error} onRetry={docs.reload} rowKey={row => row.id} onRowClick={row => setEditing(row)}
          empty={{ title: 'No knowledge documents' }}
          columns={[
            { key: 'title', header: 'Title', mobile: 'title', render: row => <>{row.title}<span className="block text-xs text-ink-muted">{titleCase(row.sourceType)} · v{row.version} · {row.chunkCount} sections</span></> },
            { key: 'visibility', header: 'Audience', render: row => <Badge tone={row.visibility === 'staff' ? 'info' : 'neutral'}>{row.visibility === 'staff' ? 'Staff only' : 'Customers & staff'}</Badge> },
            { key: 'status', header: 'Status', render: row => <StatusBadge status={row.status} label={titleCase(row.status)} /> },
            { key: 'approved', header: 'Approved by', render: row => row.approvedBy ? `${row.approvedBy}, ${relative(row.approvedAt)}` : '—' },
            { key: 'actions', header: 'Actions', render: row => (
              <div className="flex flex-wrap gap-2" onClick={event => event.stopPropagation()}>
                {row.status !== 'approved' && <Button size="sm" variant="success" onClick={() => setStatus(row, 'approved')}>Approve</Button>}
                {row.status === 'approved' && <Button size="sm" variant="secondary" onClick={() => setStatus(row, 'retired')}>Retire</Button>}
              </div>
            ) },
          ]} />
      </Card>
      {editing && <KnowledgeEditor doc={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast('Saved as draft. Another person must approve it.'); void docs.reload(); }} />}
    </>
  );
}

function KnowledgeEditor({ doc, onClose, onSaved }: { doc: KbDoc | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: doc?.title ?? '', sourceType: doc?.sourceType ?? 'institution_policy', sourceReference: doc?.sourceReference ?? '', visibility: doc?.visibility ?? 'public', body: doc?.body ?? '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const save = async () => {
    setPending(true);
    setError(null);
    try {
      await api(doc ? `/api/knowledge/${doc.id}` : '/api/knowledge', { method: doc ? 'PUT' : 'POST', body: { ...form, sourceReference: form.sourceReference || null } });
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not save.'));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="xl" title={doc ? 'Edit knowledge document' : 'Add knowledge document'} description="Use headings (## Heading) to split topics. Editing returns the document to draft until someone else approves it."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Save draft</Button></>}>
      <div className="space-y-4">
        <FormErrorSummary message={error?.message} details={error?.details} />
        <FormGrid>
          <TextInput label="Title" required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
          <Select label="Source type" value={form.sourceType} onChange={event => setForm({ ...form, sourceType: event.target.value })}
            options={['institution_policy', 'product_information', 'faq', 'public_website', 'financial_education'].map(value => ({ value, label: titleCase(value) }))} />
          <TextInput label="Source reference" value={form.sourceReference} onChange={event => setForm({ ...form, sourceReference: event.target.value })} hint="Policy number, URL or document name." />
          <Select label="Audience" value={form.visibility} onChange={event => setForm({ ...form, visibility: event.target.value as 'public' | 'staff' })}
            options={[{ value: 'public', label: 'Customers and staff' }, { value: 'staff', label: 'Staff only' }]} />
        </FormGrid>
        <TextArea label="Content" required rows={14} value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} className="font-mono text-sm" />
      </div>
    </Modal>
  );
}

// ── Audit log ────────────────────────────────────────────────────────────────

export function StaffAudit() {
  const [filters, setFilters] = useState({ action: '', outcome: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<any>(null);
  const query = new URLSearchParams({ page: String(page), ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) }).toString();
  const { data, error, loading, reload } = useResource<any>(`/api/audit-logs?${query}`);
  const set = (key: keyof typeof filters) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setFilters({ ...filters, [key]: event.target.value }); setPage(1); };
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of sign-ins, decisions, document access, permission changes and more." />
      <Card padded={false}>
        <div className="grid grid-cols-1 gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextInput label="Action starts with" placeholder="e.g. document. or application.approve" value={filters.action} onChange={set('action')} />
          <Select label="Outcome" value={filters.outcome} onChange={set('outcome')} placeholder="Any" options={['success', 'failure', 'denied'].map(value => ({ value, label: titleCase(value) }))} />
          <TextInput label="From" type="date" value={filters.from} onChange={set('from')} />
          <TextInput label="To" type="date" value={filters.to} onChange={set('to')} />
        </div>
        <DataTable caption="Audit events" rows={data?.items} loading={loading} error={error} onRetry={reload} rowKey={(row: any) => row.id} onRowClick={setOpen}
          empty={{ title: 'No events match' }} pagination={data && { page, pageSize: data.pageSize, total: data.total, onPage: setPage }}
          columns={[
            { key: 'when', header: 'When', render: (row: any) => dateTime(row.occurredAt) },
            { key: 'summary', header: 'Event', mobile: 'title', className: 'w-[40%]', render: (row: any) => <>{row.summary}<span className="block font-mono text-xs text-ink-subtle">{row.action}</span></> },
            { key: 'actor', header: 'By', render: (row: any) => `${row.actorName} (${row.actorRole})` },
            { key: 'outcome', header: 'Outcome', render: (row: any) => <Badge tone={row.outcome === 'success' ? 'success' : row.outcome === 'denied' ? 'warning' : 'danger'}>{row.outcome}</Badge> },
          ]} />
      </Card>
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title="Audit event" size="lg">
        {open && <pre className="max-h-[60dvh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-3 text-xs">{JSON.stringify(open, null, 2)}</pre>}
      </Modal>
    </>
  );
}

// ── Institution settings ─────────────────────────────────────────────────────

interface SettingRow { key: string; value: Record<string, any>; description: string | null; updatedAt: string }

export function StaffSettings() {
  const { data, error, loading, reload } = useResource<SettingRow[]>('/api/settings');
  const [tab, setTab] = useState('membership_policy');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return loading ? <LoadingBlock /> : null;
  const setting = data.find(row => row.key === tab);
  return (
    <>
      <PageHeader title="Institution settings" description="Policies the system enforces. Values marked as placeholders must be confirmed by Pinnacle before go-live." />
      <Tabs label="Settings" value={tab} onChange={setTab} tabs={[
        { id: 'membership_policy', label: 'Membership' }, { id: 'assessment_thresholds', label: 'Assessment thresholds' }, { id: 'workflow', label: 'Workflow' }, { id: 'branding', label: 'Branding & contact' },
      ]} />
      {setting && <SettingEditor key={setting.key} setting={setting} onSaved={reload} />}
    </>
  );
}

const SETTING_FIELDS: Record<string, Array<{ key: string; label: string; type: 'number' | 'boolean' | 'text' | 'ratio'; hint?: string }>> = {
  membership_policy: [
    { key: 'minimumMembershipMonths', label: 'Minimum membership period (months)', type: 'number' },
    { key: 'requireVerifiedMember', label: 'Membership must be verified by staff', type: 'boolean' },
    { key: 'smeRequiresMemberOwnerOrDirector', label: 'SME: at least one verified owner or director must be an eligible member', type: 'boolean' },
    { key: 'representativeRequiresVerifiedAuthorization', label: 'Representatives need a verified authorisation document', type: 'boolean' },
    { key: 'confirmedByInstitution', label: 'These rules have been confirmed by the institution', type: 'boolean' },
  ],
  assessment_thresholds: [
    { key: 'maxIndividualDebtServiceRatio', label: 'Individuals: maximum debt service ratio (%)', type: 'ratio' },
    { key: 'minBusinessDebtServiceCoverage', label: 'Businesses: minimum debt service coverage (×)', type: 'number' },
    { key: 'maxInstallmentToRevenueRatio', label: 'Businesses: maximum installment ÷ revenue (%)', type: 'ratio' },
    { key: 'minMonthsTrading', label: 'Businesses: minimum months trading', type: 'number' },
    { key: 'maxSingleCustomerConcentration', label: 'Businesses: maximum share from one customer (%)', type: 'ratio' },
    { key: 'confirmedByInstitution', label: 'These thresholds come from the approved credit policy', type: 'boolean', hint: 'Thresholds only flag risks for officers; they never decide.' },
  ],
  workflow: [
    { key: 'requireSeparationOfDuties', label: 'Separation of duties (assessor/recommender cannot approve)', type: 'boolean' },
    { key: 'offerValidityDays', label: 'Offer validity (days)', type: 'number' },
  ],
  branding: [
    { key: 'institutionName', label: 'Institution name', type: 'text' }, { key: 'shortName', label: 'Short name', type: 'text' },
    { key: 'legalName', label: 'Legal name', type: 'text' }, { key: 'website', label: 'Website', type: 'text' },
    { key: 'supportEmail', label: 'Support email', type: 'text' }, { key: 'supportPhone', label: 'Support phone', type: 'text' },
    { key: 'tollFree', label: 'Toll-free number', type: 'text' }, { key: 'whatsapp', label: 'WhatsApp', type: 'text' },
    { key: 'regulatoryStatement', label: 'Regulatory statement', type: 'text' },
  ],
};

function SettingEditor({ setting, onSaved }: { setting: SettingRow; onSaved: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState<Record<string, any>>(setting.value);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => setValue(setting.value), [setting]);
  const fields = SETTING_FIELDS[setting.key] ?? [];
  const save = async () => {
    setPending(true);
    setError(null);
    try {
      await api(`/api/settings/${setting.key}`, { method: 'PUT', body: value });
      toast('Settings saved and audited.');
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not save.'));
    } finally {
      setPending(false);
    }
  };
  return (
    <Card description={setting.description ?? undefined}>
      <div className="space-y-4">
        {value.confirmedByInstitution === false && <Alert tone="warning">These values are placeholders and have not been confirmed by the institution.</Alert>}
        <FormErrorSummary message={error?.message} details={error?.details} />
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map(field => field.type === 'boolean' ? (
            <div key={field.key} className="md:col-span-2"><Checkbox label={field.label} description={field.hint} checked={Boolean(value[field.key])} onChange={checked => setValue({ ...value, [field.key]: checked })} /></div>
          ) : field.type === 'ratio' ? (
            <TextInput key={field.key} label={field.label} type="number" min={0} max={100} step="1" value={Math.round((value[field.key] ?? 0) * 100)} onChange={event => setValue({ ...value, [field.key]: Number(event.target.value) / 100 })} />
          ) : field.type === 'number' ? (
            <TextInput key={field.key} label={field.label} type="number" min={0} step="any" value={value[field.key] ?? ''} onChange={event => setValue({ ...value, [field.key]: Number(event.target.value) })} />
          ) : (
            <TextInput key={field.key} label={field.label} value={value[field.key] ?? ''} onChange={event => setValue({ ...value, [field.key]: event.target.value || null })} />
          ))}
        </div>
        <p className="text-xs text-ink-subtle">Last updated {dateTime(setting.updatedAt)}</p>
        <div className="flex justify-end"><Button onClick={save} loading={pending}>Save</Button></div>
      </div>
    </Card>
  );
}
