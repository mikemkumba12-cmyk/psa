import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Calendar, Download, RefreshCw, FileText, ChevronRight, PieChart, Users, TrendingUp, Activity } from 'lucide-react';
import { auditStore, applicationsStore, repaymentsStore } from '../lib/store';
import { recordAuditEvent } from '../lib/auditTrail';
import { useAuth } from '../auth/AuthContext';
import { hasApiBackend, apiRequest } from '../lib/apiClient';

interface AdminReportsProps {
  dashboardSummary?: {
    totalDisbursed: number;
    totalCollected: number;
    collectionRate: number;
    totalInterestEarned: number;
    pendingCount: number;
    activeCount: number;
    totalApplications: number;
    monthlyDisbursements: { name: string; amount: number }[];
    sectorBreakdown: { sector: string; disbursed: number; count: number; pct: number }[];
    recentAuditActivity: any[];
  } | null;
  onSyncSummary?: () => void;
}

const mockChartData = [
  { name: 'Jan', amount: 12000000 },
  { name: 'Feb', amount: 19000000 },
  { name: 'Mar', amount: 15000000 },
  { name: 'Apr', amount: 28000000 },
  { name: 'May', amount: 22000000 },
  { name: 'Jun', amount: 35000000 },
  { name: 'Jul', amount: 31000000 },
  { name: 'Aug', amount: 48000000 },
  { name: 'Sep', amount: 42000000 },
  { name: 'Oct', amount: 52000000 },
];

export default function AdminReports({ dashboardSummary, onSyncSummary }: AdminReportsProps) {
  const { session } = useAuth();
  const [auditLogs, setAuditLogs] = React.useState(() => auditStore.getAll());
  
  const recentAuditLogs = dashboardSummary?.recentAuditActivity 
    ? dashboardSummary.recentAuditActivity.slice(0, 6) 
    : auditLogs.slice(0, 6);

  const handleSyncIndex = () => {
    recordAuditEvent({
      actorId: session?.userId || 'staff-local',
      actorName: session?.fullName || 'Staff User',
      actorRole: 'staff',
      action: 'reports.sync_index',
      entityType: 'reporting_index',
      outcome: 'success',
      summary: 'Staff refreshed reporting index indicators.',
    });
    
    if (onSyncSummary) {
      onSyncSummary();
    } else {
      setAuditLogs(auditStore.getAll());
    }
  };

  // Helper to trigger CSV file generation and download on client-side
  const downloadCSVClient = (data: any[], filename: string) => {
    if (!data || !data.length) return;
    const keys = Object.keys(data[0]);
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvContent = [
      keys.join(','),
      ...data.map(row => keys.map(k => escape(row[k])).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = (type: 'portfolio' | 'audit' | 'repayments') => {
    if (hasApiBackend()) {
      const baseUrl = ((import.meta as any).env.VITE_API_BASE_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('psa_auth_token') || sessionStorage.getItem('psa_auth_token');
      // Trigger API report export via browser download
      window.open(`${baseUrl}/api/reports/export?type=${type}&token=${token}`, '_blank');
    } else {
      // Local storage offline CSV fallback
      if (type === 'portfolio') {
        const list = applicationsStore.getAll();
        downloadCSVClient(list, 'portfolio_report.csv');
      } else if (type === 'audit') {
        const list = auditStore.getAll();
        downloadCSVClient(list, 'audit_trail.csv');
      } else if (type === 'repayments') {
        const list = repaymentsStore.getAll();
        downloadCSVClient(list, 'repayments_report.csv');
      }
    }
  };

  const chartData = dashboardSummary?.monthlyDisbursements && dashboardSummary.monthlyDisbursements.length > 0
    ? dashboardSummary.monthlyDisbursements
    : mockChartData;

  const sectorList = dashboardSummary?.sectorBreakdown && dashboardSummary.sectorBreakdown.length > 0
    ? dashboardSummary.sectorBreakdown
    : [
        { sector: 'Agriculture & Inputs', pct: 42, label: 'Healthy' },
        { sector: 'Retail Merchants', pct: 28, label: 'Stable' },
        { sector: 'Sustainable Energy / Solar', pct: 18, label: 'Growing' },
        { sector: 'Manufacturing & Logistics', pct: 12, label: 'Neutral' }
      ];

  const outstandingPortfolio = dashboardSummary?.totalDisbursed ?? 0;
  const interestEarned = dashboardSummary?.totalInterestEarned ?? 0;

  return (
    <div className="space-y-6">
      {/* Top Header & Refresh */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Analytics & Reports</h1>
          <p className="text-sm text-secondary">Real-time credit indices and sector disbursements.</p>
        </div>
        <button 
          onClick={handleSyncIndex}
          className="border border-outline-variant p-2.5 rounded-xl hover:bg-surface-container transition-colors text-secondary hover:text-primary flex items-center gap-1.5 text-xs font-bold bg-white"
        >
          <RefreshCw className="w-4 h-4" /> Sync Index
        </button>
      </div>

      {/* Metrics Row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-outline-variant p-4 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-secondary uppercase block">Outstanding Portfolio</span>
            <p className="text-lg font-bold text-on-surface">K {outstandingPortfolio.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white border border-outline-variant p-4 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-50 text-green-700 flex items-center justify-center flex-shrink-0">
            <PieChart className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-secondary uppercase block">Interest Earned (YTD)</span>
            <p className="text-lg font-bold text-green-700">K {interestEarned.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white border border-outline-variant p-4 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-secondary uppercase block">Avg Approval Window</span>
            <p className="text-lg font-bold text-blue-600">1.8 Hours</p>
          </div>
        </div>
      </section>

      {/* Recharts Trend Chart Card */}
      <section className="bg-white border border-outline-variant rounded-2xl p-5 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-base font-bold text-on-surface">Loan Disbursement Trends</h2>
            <p className="text-xs text-secondary">Aggregate capital disbursements month-over-month (MWK)</p>
          </div>
          <span className="bg-surface-container-high text-on-surface font-bold text-[10px] px-3 py-1 rounded-full flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> 2023 Trend
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorDisburse" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#964900" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#964900" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
              <XAxis dataKey="name" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis 
                stroke="#888888" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                tickFormatter={(value) => `${value / 1000000}M`}
              />
              <Tooltip 
                formatter={(value: any) => [`K ${Number(value).toLocaleString()}`, 'Disbursement']}
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '11px' }}
              />
              <Area type="monotone" dataKey="amount" stroke="#964900" strokeWidth={3} fillOpacity={1} fill="url(#colorDisburse)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Sector Breakdown & Generated Downloads Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sector breakdown progress indicators */}
        <section className="bg-white border border-outline-variant p-5 rounded-2xl shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-bold text-on-surface">Repayments by Sector</h2>
            <p className="text-xs text-secondary">Current allocation and health across SME sectors</p>
          </div>

          <div className="space-y-4">
            {sectorList.map((item, index) => (
              <div key={index} className="space-y-1">
                <div className="flex justify-between items-baseline text-xs font-semibold">
                  <span className="text-on-surface">{item.sector}</span>
                  <span className="text-primary">{item.pct}% {item.pct > 30 ? '(Healthy)' : '(Growing)'}</span>
                </div>
                <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${item.pct}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Generated Reports PDF/CSV downloads */}
        <section className="bg-white border border-outline-variant p-5 rounded-2xl shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-bold text-on-surface">Compiled Executive Reports</h2>
            <p className="text-xs text-secondary">Export validated ledger sheets and compliance audits</p>
          </div>

          <div className="space-y-3">
            {/* Report 1 */}
            <div className="p-3 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 rounded-xl flex justify-between items-center transition-colors">
              <div className="flex items-center gap-3">
                <FileText className="text-primary w-5 h-5" />
                <div>
                  <h4 className="text-xs font-bold text-on-surface">Pinnacle Loan Portfolio Report</h4>
                  <p className="text-[10px] text-secondary">CSV Format • Full Audit Ledger</p>
                </div>
              </div>
              <button 
                onClick={() => handleExport('portfolio')}
                className="p-2 bg-white hover:bg-primary/5 text-primary border border-outline-variant/50 rounded-lg flex items-center justify-center"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>

            {/* Report 2 */}
            <div className="p-3 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 rounded-xl flex justify-between items-center transition-colors">
              <div className="flex items-center gap-3">
                <FileText className="text-primary w-5 h-5" />
                <div>
                  <h4 className="text-xs font-bold text-on-surface">System Audit Trail Logs</h4>
                  <p className="text-[10px] text-secondary">CSV Format • Operations Log</p>
                </div>
              </div>
              <button 
                onClick={() => handleExport('audit')}
                className="p-2 bg-white hover:bg-primary/5 text-primary border border-outline-variant/50 rounded-lg flex items-center justify-center"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>

            {/* Report 3 */}
            <div className="p-3 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 rounded-xl flex justify-between items-center transition-colors">
              <div className="flex items-center gap-3">
                <FileText className="text-primary w-5 h-5" />
                <div>
                  <h4 className="text-xs font-bold text-on-surface">Client Repayments Sheet</h4>
                  <p className="text-[10px] text-secondary">CSV Format • Outstanding Repayments</p>
                </div>
              </div>
              <button 
                onClick={() => handleExport('repayments')}
                className="p-2 bg-white hover:bg-primary/5 text-primary border border-outline-variant/50 rounded-lg flex items-center justify-center"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Audit Trail */}
      <section className="bg-white border border-outline-variant rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <div>
              <h2 className="text-base font-bold text-on-surface">System Audit Trail</h2>
              <p className="text-xs text-secondary">Recent operational, KYC, credit, and security events</p>
            </div>
          </div>
          <button
            onClick={handleSyncIndex}
            className="border border-outline-variant p-2 rounded-xl hover:bg-surface-container transition-colors text-secondary hover:text-primary"
            title="Refresh audit trail"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-container/50 border-b border-surface-container text-secondary font-bold uppercase tracking-wider">
                <th className="p-3 font-semibold">Time</th>
                <th className="p-3 font-semibold">Actor</th>
                <th className="p-3 font-semibold">Action</th>
                <th className="p-3 font-semibold">Outcome</th>
                <th className="p-3 font-semibold">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {recentAuditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-5 text-center text-secondary">No audit events recorded yet.</td>
                </tr>
              ) : recentAuditLogs.map((log: any) => (
                <tr key={log.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="p-3 text-secondary whitespace-nowrap">
                    {new Date(log.occurredAt || log.occurred_at).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <p className="font-bold text-on-surface">{log.actorName || log.actor_name}</p>
                    <p className="text-[10px] text-secondary uppercase">{log.actorRole || log.actor_role}</p>
                  </td>
                  <td className="p-3 font-mono text-[10px] text-primary whitespace-nowrap">{log.action}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      log.outcome === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                      log.outcome === 'failure' ? 'bg-red-50 text-red-700 border border-red-200' :
                      'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {log.outcome}
                    </span>
                  </td>
                  <td className="p-3 text-on-surface">{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
