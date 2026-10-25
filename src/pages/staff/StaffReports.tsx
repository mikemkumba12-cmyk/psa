import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { downloadFile } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { money, percent, statusLabel, titleCase } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button } from '../../ui/Button';
import { Alert, Badge, ErrorState, LoadingBlock } from '../../ui/Feedback';
import { Checkbox, TextInput } from '../../ui/Form';
import { Card, PageHeader, Stat, StatGrid, Tabs } from '../../ui/Layout';
import { DataTable } from '../../ui/DataTable';
import { useToast } from '../../ui/Toast';

const BRAND = '#d96b0c';
const INK = '#57534e';
const SUCCESS = '#067647';
const DANGER = '#b42318';
const compact = (value: number) => (Math.abs(value) >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : String(value));

export function StaffReports() {
  const { can } = useAuth();
  const toast = useToast();
  const yearAgo = new Date(Date.now() - 364 * 86_400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(yearAgo);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [includeDemo, setIncludeDemo] = useState(true);
  const [tab, setTab] = useState<'portfolio' | 'sme' | 'quality'>('portfolio');
  const range = `from=${from}&to=${to}&includeDemo=${includeDemo}`;
  const overview = useResource<any>(tab === 'portfolio' ? `/api/reports/overview?${range}` : null);
  const sme = useResource<any>(tab === 'sme' && can('reports.sme') ? `/api/reports/sme?${range}` : null);
  const quality = useResource<any>(tab === 'quality' ? '/api/reports/data-quality' : null);
  const history = useResource<any>(tab === 'portfolio' ? `/api/reports/history?${range}` : null);

  const exportCsv = (type: string) => downloadFile(`/api/reports/export/${type}?from=${from}&to=${to}`, `${type}.csv`).catch(caught => toast(caught.message, 'error'));

  return (
    <>
      <PageHeader title="Reports" description="Every figure is calculated from recorded applications, schedules and confirmed transactions."
        actions={can('reports.export') && <>
          <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => exportCsv('applications')}>Applications CSV</Button>
          <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => exportCsv('transactions')}>Transactions CSV</Button>
          <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => exportCsv('portfolio')}>Portfolio CSV</Button>
        </>} />
      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextInput label="From" type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} fieldClassName="sm:w-44" />
          <TextInput label="To" type="date" value={to} min={from} onChange={event => setTo(event.target.value)} fieldClassName="sm:w-44" />
          <div className="sm:pb-2"><Checkbox label="Include demo data" checked={includeDemo} onChange={setIncludeDemo} /></div>
        </div>
      </Card>
      <Tabs label="Report" value={tab} onChange={setTab} tabs={[
        { id: 'portfolio', label: 'Portfolio & pipeline' }, ...(can('reports.sme') ? [{ id: 'sme' as const, label: 'SME' }] : []), { id: 'quality', label: 'Data quality' },
      ]} />

      {tab === 'portfolio' && (overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : !overview.data ? <LoadingBlock /> : (
        <div className="space-y-6">
          {overview.data.dataComposition.demo_applications > 0 && includeDemo && (
            <Alert tone="warning">These figures include {overview.data.dataComposition.demo_applications} demo application(s) alongside {overview.data.dataComposition.live_applications} live one(s).</Alert>
          )}
          <StatGrid>
            <Stat label="Outstanding principal" value={money(overview.data.portfolio.outstanding_principal, { compact: true })} hint={`${overview.data.portfolio.active_loans} active loans`} />
            <Stat label="In arrears" value={money(overview.data.portfolio.arrears, { compact: true })} tone={overview.data.portfolio.arrears > 0 ? 'danger' : undefined} hint={`${overview.data.portfolio.loans_in_arrears} loans`} />
            <Stat label="PAR 30" value={percent(overview.data.portfolio.par30, 1)} hint="Principal >30 days late" />
            <Stat label="Collection rate" value={percent(overview.data.collectionRate, 1)} hint="Paid ÷ due in period" />
            <Stat label="Disbursed in period" value={money(overview.data.flows.disbursed, { compact: true })} hint={`${overview.data.flows.disbursement_count} loans`} />
            <Stat label="Collected in period" value={money(overview.data.flows.collected, { compact: true })} />
            <Stat label="Approval rate" value={percent(overview.data.decisions.approvalRate)} hint={`${overview.data.decisions.approved} approved · ${overview.data.decisions.rejected} not`} />
            <Stat label="Days to decision" value={overview.data.decisions.medianDaysToDecision !== null ? overview.data.decisions.medianDaysToDecision.toFixed(1) : '—'} hint="Median, submission to decision" />
          </StatGrid>

          <Card title="Applications by month" description="Submitted, approved and not approved.">
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <BarChart data={overview.data.monthly} margin={{ left: -10, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: INK }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: INK }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="submitted" name="Submitted" fill={INK} />
                  <Bar dataKey="approved" name="Approved" fill={SUCCESS} />
                  <Bar dataKey="rejected" name="Not approved" fill={DANGER} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Money in and out by month" description="Confirmed disbursements and repayments.">
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <LineChart data={overview.data.monthly} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: INK }} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: INK }} />
                  <Tooltip formatter={(value: number) => money(value)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="disbursed" name="Disbursed" stroke={BRAND} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="collected" name="Collected" stroke={SUCCESS} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {history.data?.points?.length > 1 && (
            <Card title="Outstanding principal over time" description="From daily portfolio snapshots.">
              <div className="h-56 w-full">
                <ResponsiveContainer>
                  <LineChart data={history.data.points} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                    <XAxis dataKey="snapshot_date" tick={{ fontSize: 11, fill: INK }} />
                    <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: INK }} />
                    <Tooltip formatter={(value: number) => money(value)} />
                    <Line type="monotone" dataKey="outstanding_principal" name="Outstanding" stroke={BRAND} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="arrears" name="Arrears" stroke={DANGER} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Pipeline" padded={false}>
              <DataTable caption="Pipeline by status" rows={overview.data.pipeline} rowKey={(row: any) => row.status} empty={{ title: 'No applications' }}
                columns={[
                  { key: 'status', header: 'Status', mobile: 'title', render: (row: any) => statusLabel(row.status) },
                  { key: 'count', header: 'Applications', align: 'right', render: (row: any) => row.count },
                  { key: 'amount', header: 'Amount', align: 'right', render: (row: any) => money(row.amount, { compact: true }) },
                ]} />
            </Card>
            <Card title="By product" padded={false}>
              <DataTable caption="By product" rows={overview.data.byProduct.filter((row: any) => row.applications > 0)} rowKey={(row: any) => row.id} empty={{ title: 'No applications yet' }}
                columns={[
                  { key: 'name', header: 'Product', mobile: 'title', render: (row: any) => row.name },
                  { key: 'apps', header: 'Applications', align: 'right', render: (row: any) => row.applications },
                  { key: 'funded', header: 'Funded', align: 'right', render: (row: any) => row.funded },
                  { key: 'outstanding', header: 'Outstanding', align: 'right', render: (row: any) => money(row.outstanding_principal, { compact: true }) },
                ]} />
            </Card>
          </div>
          <Card title="Definitions">
            <dl className="space-y-2 text-sm">{Object.entries(overview.data.definitions).map(([key, text]) => <div key={key}><dt className="font-semibold">{titleCase(key.replace(/([A-Z])/g, '_$1').toLowerCase())}</dt><dd className="text-ink-muted">{text as string}</dd></div>)}</dl>
          </Card>
        </div>
      ))}

      {tab === 'sme' && (sme.error ? <ErrorState error={sme.error} onRetry={sme.reload} /> : !sme.data ? <LoadingBlock /> : (
        <div className="space-y-6">
          <StatGrid>
            <Stat label="Awaiting verification" value={sme.data.queues.awaitingVerification} hint="Applications + business profiles" />
            <Stat label="Awaiting assessment" value={sme.data.queues.awaitingAssessment} />
            <Stat label="Awaiting approval" value={sme.data.queues.awaitingApproval} />
            <Stat label="Waiting on applicant" value={sme.data.queues.waitingOnApplicant} hint={`${sme.data.queues.documentsPendingReview} documents to review`} />
          </StatGrid>
          <StatGrid>
            <Stat label="SME outstanding" value={money(sme.data.portfolio.outstanding_principal, { compact: true })} hint={`${sme.data.portfolio.active_loans} loans`} />
            <Stat label="SME arrears" value={money(sme.data.portfolio.arrears, { compact: true })} tone={sme.data.portfolio.arrears > 0 ? 'danger' : undefined} />
            <Stat label="SME PAR 30" value={percent(sme.data.portfolio.par30, 1)} />
            <Stat label="Verified businesses" value={`${sme.data.businesses?.verified_businesses ?? 0} / ${sme.data.businesses?.total_businesses ?? 0}`} />
          </StatGrid>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="By sector" padded={false}>
              <DataTable caption="SME by sector" rows={sme.data.bySector} rowKey={(row: any) => row.sector} empty={{ title: 'No SME applications in this period' }}
                columns={[
                  { key: 'sector', header: 'Sector', mobile: 'title', render: (row: any) => row.sector },
                  { key: 'apps', header: 'Applications', align: 'right', render: (row: any) => row.applications },
                  { key: 'funded', header: 'Funded', align: 'right', render: (row: any) => row.funded },
                  { key: 'amount', header: 'Funded amount', align: 'right', render: (row: any) => money(row.funded_amount, { compact: true }) },
                ]} />
            </Card>
            <Card title="Turnaround by product" padded={false}>
              <DataTable caption="Turnaround" rows={sme.data.turnaround} rowKey={(row: any) => row.product} empty={{ title: 'No decisions in this period' }}
                columns={[
                  { key: 'product', header: 'Product', mobile: 'title', render: (row: any) => row.product },
                  { key: 'decided', header: 'Decided', align: 'right', render: (row: any) => row.decided },
                  { key: 'days', header: 'Average days', align: 'right', render: (row: any) => row.avg_days ?? '—' },
                ]} />
            </Card>
          </div>
        </div>
      ))}

      {tab === 'quality' && (quality.error ? <ErrorState error={quality.error} onRetry={quality.reload} /> : !quality.data ? <LoadingBlock /> : (
        <div className="space-y-6">
          <Card title="Data volumes">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.entries(quality.data.volumes).map(([key, value]) => <div key={key}><dt className="text-xs text-ink-subtle">{titleCase(key)}</dt><dd className="text-lg font-bold tabular-nums">{String(value)}</dd></div>)}
            </dl>
          </Card>
          <Card title="Checks" padded={false}>
            <ul className="divide-y divide-line">
              {quality.data.checks.map((check: any) => (
                <li key={check.check} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>{titleCase(check.check)}</span>
                  <Badge tone={check.count === 0 ? 'success' : check.check === 'demo_records_present' ? 'warning' : 'danger'}>{check.count}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ))}
    </>
  );
}
