import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import type { ApplicationSummary, Paged } from '../../api/types';
import { date, money, percent } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { DataTable } from '../../ui/DataTable';
import { Alert, StatusBadge } from '../../ui/Feedback';
import { Card, PageHeader, Stat, StatGrid } from '../../ui/Layout';

interface Queues { byStatus: Record<string, number>; assignedToMe: number; unassigned: number; awaitingMyApproval: number; pendingTransactions: number }

/** The staff landing page leads with work waiting for this person, then portfolio context if they may see reports. */
export function StaffOverview() {
  const { profile, can } = useAuth();
  const navigate = useNavigate();
  const queues = useResource<Queues>('/api/applications/queues');
  const mine = useResource<Paged<ApplicationSummary>>('/api/applications?assigned=me&status=under_review,assessed,info_requested&pageSize=8&sort=updated_at');
  const report = useResource<any>(can('reports.view') ? '/api/reports/overview' : null);

  const tiles = [
    { label: 'Assigned to me', value: queues.data?.assignedToMe, to: '/staff/applications?assigned=me', show: can('applications.assess') },
    { label: 'Waiting for assignment', value: queues.data?.unassigned, to: '/staff/applications?status=submitted', show: can('applications.assign') },
    { label: 'Awaiting my decision', value: queues.data?.awaitingMyApproval, to: '/staff/applications?status=recommended', show: can('applications.approve') },
    { label: 'Transactions to confirm', value: queues.data?.pendingTransactions, to: '/staff/transactions', show: can('disbursements.confirm') || can('repayments.confirm') },
  ].filter(tile => tile.show);

  return (
    <>
      <PageHeader title={`Good day, ${profile?.fullName.split(' ')[0] ?? ''}`} description="Work waiting for you." />
      {queues.error && <Alert tone="danger">{queues.error.message}</Alert>}
      {tiles.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {tiles.map(tile => (
            <Link key={tile.label} to={tile.to} className="group rounded-card border border-line bg-surface p-4 shadow-card hover:border-brand-200">
              <p className="text-sm text-ink-muted">{tile.label}</p>
              <p className="mt-1 flex items-center justify-between text-2xl font-bold tabular-nums text-ink">
                {tile.value ?? '—'}
                <ArrowRight className="h-4 w-4 text-ink-subtle group-hover:text-brand-700" aria-hidden />
              </p>
            </Link>
          ))}
        </div>
      )}

      {can('applications.assess') && (
        <Card title="My open applications" padded={false} className="mb-6"
          actions={<Link to="/staff/applications?assigned=me" className="text-sm font-semibold text-brand-700 hover:underline">See all</Link>}>
          <DataTable caption="My open applications" rows={mine.data?.items} loading={mine.loading} error={mine.error} onRetry={mine.reload} rowKey={row => row.id}
            onRowClick={row => navigate(`/staff/applications/${row.id}`)} empty={{ title: 'Nothing assigned to you right now' }}
            columns={[
              { key: 'applicant', header: 'Applicant', mobile: 'title', render: row => row.applicantName },
              { key: 'product', header: 'Product', render: row => row.productName },
              { key: 'amount', header: 'Amount', align: 'right', render: row => money(row.amount) },
              { key: 'updated', header: 'Last update', render: row => date(row.updatedAt) },
              { key: 'status', header: 'Status', render: row => <StatusBadge status={row.status} /> },
            ]} />
        </Card>
      )}

      {report.data && (
        <section aria-labelledby="portfolio-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="portfolio-heading" className="text-base font-semibold text-ink">Portfolio (last 12 months)</h2>
            <Link to="/staff/reports" className="text-sm font-semibold text-brand-700 hover:underline">Full reports</Link>
          </div>
          {report.data.dataComposition?.demo_applications > 0 && (
            <div className="mb-3"><Alert tone="warning">Includes {report.data.dataComposition.demo_applications} demo application(s). Exclude them in Reports.</Alert></div>
          )}
          <StatGrid>
            <Stat label="Active loans" value={report.data.portfolio.active_loans} />
            <Stat label="Outstanding principal" value={money(report.data.portfolio.outstanding_principal, { compact: true })} />
            <Stat label="Portfolio at risk (30+ days)" value={percent(report.data.portfolio.par30, 1)} tone={report.data.portfolio.par30 > 0.05 ? 'danger' : undefined} />
            <Stat label="Approval rate" value={percent(report.data.decisions.approvalRate)} hint={`${report.data.decisions.approved} approved · ${report.data.decisions.rejected} not approved`} />
          </StatGrid>
        </section>
      )}
    </>
  );
}
