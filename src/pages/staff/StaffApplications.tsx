import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ApplicationSummary, Paged, Product } from '../../api/types';
import { date, money, STATUS_LABELS } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { DataTable } from '../../ui/DataTable';
import { DemoBadge, StatusBadge } from '../../ui/Feedback';
import { Select, TextInput } from '../../ui/Form';
import { Card, PageHeader } from '../../ui/Layout';

const STATUS_FILTERS = ['submitted', 'under_review', 'info_requested', 'assessed', 'recommended', 'approved', 'offer_issued', 'offer_accepted', 'disbursed', 'rejected', 'closed', 'withdrawn'];

export function StaffApplications() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const products = useResource<Product[]>('/api/products');
  const page = Number(params.get('page') ?? 1);
  const sort = params.get('sort') ?? 'updated_at';
  const direction = (params.get('direction') ?? 'desc') as 'asc' | 'desc';

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  const query = new URLSearchParams(params);
  query.set('pageSize', '25');
  const { data, error, loading, reload } = useResource<Paged<ApplicationSummary>>(`/api/applications?${query.toString()}`);

  return (
    <>
      <PageHeader title="Applications" description="Only applications for products you are authorised to work on are shown." />
      <Card padded={false}>
        <form className="grid grid-cols-1 gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={event => { event.preventDefault(); update({ search: search || null }); }}>
          <TextInput label="Search" placeholder="Reference or name" value={search} onChange={event => setSearch(event.target.value)} onBlur={() => update({ search: search || null })} />
          <Select label="Status" value={params.get('status') ?? ''} onChange={event => update({ status: event.target.value || null })} placeholder="All statuses"
            options={STATUS_FILTERS.map(value => ({ value, label: STATUS_LABELS[value] }))} />
          <Select label="Product" value={params.get('productId') ?? ''} onChange={event => update({ productId: event.target.value || null })} placeholder="All products"
            options={(products.data ?? []).map(product => ({ value: product.id, label: product.name }))} />
          <Select label="Assigned" value={params.get('assigned') ?? 'any'} onChange={event => update({ assigned: event.target.value === 'any' ? null : event.target.value })}
            options={[{ value: 'any', label: 'Anyone' }, { value: 'me', label: 'Me' }, { value: 'unassigned', label: 'Unassigned' }]} />
        </form>
        <DataTable caption="Applications" rows={data?.items} loading={loading} error={error} onRetry={reload} rowKey={row => row.id}
          onRowClick={row => navigate(`/staff/applications/${row.id}`)}
          empty={{ title: 'No applications match these filters' }}
          sort={{ key: sort, direction }}
          onSort={key => update({ sort: key, direction: sort === key && direction === 'desc' ? 'asc' : 'desc' })}
          pagination={data && { page, pageSize: data.pageSize, total: data.total, onPage: next => update({ page: String(next) }) }}
          columns={[
            { key: 'applicant', header: 'Applicant', mobile: 'title', className: 'w-[24%]', render: row => <>{row.applicantName} <DemoBadge show={row.isDemo} /><span className="block text-xs text-ink-muted">{row.reference}</span></> },
            { key: 'product', header: 'Product', render: row => row.productName },
            { key: 'amount', header: 'Amount', align: 'right', sortable: true, render: row => money(row.amount) },
            { key: 'submitted_at', header: 'Submitted', sortable: true, render: row => date(row.submittedAt) },
            { key: 'officer', header: 'Officer', render: row => row.assignedOfficerName ?? <span className="text-ink-subtle">Unassigned</span> },
            { key: 'status', header: 'Status', render: row => <StatusBadge status={row.status} /> },
          ]} />
      </Card>
    </>
  );
}
