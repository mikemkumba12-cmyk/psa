import React, { useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  BarChart3, TrendingUp, TrendingDown, Users, DollarSign,
  ShieldCheck, AlertTriangle, Lightbulb,
} from 'lucide-react';
import { useAdminData } from '../context/AdminContext';
import {
  computeDynamicPortfolioTimeline,
  computeDynamicSectorTrends,
  generateDynamicInsights,
  computeCustomerLifetimeValue,
} from '../lib/intelligenceEngine';
import { repaymentsStore, customersStore, payrollStore } from '../lib/store';
import { AI_TRANSPARENCY } from '../lib/aiTransparency';

const tooltipStyle = {
  contentStyle: {
    fontSize: 11,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
  },
  labelStyle: { fontWeight: 700, color: '#111827' },
};

export default function AdminAnalytics() {
  const { applications } = useAdminData();

  const repayments = useMemo(() => repaymentsStore.getAllUnfiltered(), []);
  const customers = useMemo(() => customersStore.getAll(), []);
  const payrollRecords = useMemo(() => payrollStore.getAllRecords(), []);

  const portfolioTimeline = useMemo(() => computeDynamicPortfolioTimeline(applications, repayments), [applications, repayments]);
  const sectorTrends = useMemo(() => computeDynamicSectorTrends(applications, repayments), [applications, repayments]);
  const dataMiningInsights = useMemo(() => generateDynamicInsights(applications, repayments, customers, payrollRecords), [applications, repayments, customers, payrollRecords]);

  // Sector distribution bar data
  const sectorBarData = useMemo(() => {
    const counts: Record<string, number> = {};
    applications.forEach(a => {
      counts[a.sector] = (counts[a.sector] || 0) + a.amount;
    });
    return Object.entries(counts).map(([sector, total]) => ({
      sector: sector.length > 12 ? sector.slice(0, 12) + '…' : sector,
      total: Math.round(total / 1000000),
    })).sort((a, b) => b.total - a.total);
  }, [applications]);

  // Risk tier distribution
  const riskData = useMemo(() => {
    const counts = { Low: 0, Medium: 0, High: 0 };
    applications.forEach(a => { counts[a.riskLevel]++; });
    return [
      { name: 'Low Risk', value: counts.Low, color: '#16a34a' },
      { name: 'Medium Risk', value: counts.Medium, color: '#d97706' },
      { name: 'High Risk', value: counts.High, color: '#dc2626' },
    ];
  }, [applications]);

  // KPIs
  const totalDisbursed = portfolioTimeline.reduce((s, m) => s + m.disbursed, 0);
  const totalCollected = portfolioTimeline.reduce((s, m) => s + m.collected, 0);
  const totalCustomers = portfolioTimeline.reduce((s, m) => s + m.newCustomers, 0);
  const totalDefaults = portfolioTimeline.reduce((s, m) => s + m.defaults, 0);
  const collectionRate = totalDisbursed > 0 ? ((totalCollected / totalDisbursed) * 100).toFixed(1) : '0.0';

  // Collection rate by month
  const collectionRateData = portfolioTimeline.map(m => ({
    month: m.month,
    rate: m.disbursed > 0 ? +((m.collected / m.disbursed) * 100).toFixed(1) : 0,
    target: 98.0,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md shadow-blue-500/30">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Business Analytics</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 ml-10">
            Portfolio performance · Sector analysis · Risk distribution · Growth trends
          </p>
        </div>
        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/5 px-3 py-1.5 rounded-full">
          Last 12 months
        </span>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Disbursed', value: `MWK ${(totalDisbursed / 1000000).toFixed(1)}M`,
            sub: '+14.2% vs last year', Icon: DollarSign, color: 'text-violet-600 bg-violet-50 dark:bg-violet-500/10', up: true,
          },
          {
            label: 'Total Collected', value: `MWK ${(totalCollected / 1000000).toFixed(1)}M`,
            sub: `${collectionRate}% collection rate`, Icon: ShieldCheck, color: 'text-green-600 bg-green-50 dark:bg-green-500/10', up: true,
          },
          {
            label: 'New Customers', value: totalCustomers,
            sub: 'Portfolio growth YTD', Icon: Users, color: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10', up: true,
          },
          {
            label: 'Total Defaults', value: totalDefaults,
            sub: 'Across all sectors', Icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-500/10', up: false,
          },
        ].map(({ label, value, sub, Icon, color, up }) => (
          <div key={label} className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{label}</span>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-gray-900 dark:text-white">{value}</p>
            <p className={`text-[10px] font-semibold mt-0.5 flex items-center gap-1 ${up ? 'text-green-600' : 'text-red-600'}`}>
              {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {sub}
            </p>
          </div>
        ))}
      </div>

      {/* Portfolio Performance — Area Chart */}
      <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Portfolio Performance — Disbursements vs. Collections</h2>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">MWK millions · 12-month rolling view</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={portfolioTimeline} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradDisbursed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCollected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={v => `${(v / 1000000).toFixed(0)}M`}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false} tickLine={false} width={42}
            />
            <Tooltip
              formatter={(val: any) => [`MWK ${(val / 1000000).toFixed(2)}M`]}
              {...tooltipStyle}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="disbursed" name="Disbursed" stroke="#7c3aed" strokeWidth={2} fill="url(#gradDisbursed)" dot={false} />
            <Area type="monotone" dataKey="collected" name="Collected" stroke="#16a34a" strokeWidth={2} fill="url(#gradCollected)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      {/* Second row: Sector + Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Sector Loan Volume */}
        <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Loan Volume by Sector</h2>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-5">MWK millions disbursed</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sectorBarData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v}M`} />
              <YAxis dataKey="sector" type="category" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={80} />
              <Tooltip formatter={(v: any) => [`MWK ${v}M`]} {...tooltipStyle} />
              <Bar dataKey="total" name="Disbursed" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        {/* Collection Rate Trend */}
        <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Collection Rate Trend</h2>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-5">% collected vs 98% minimum target</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={collectionRateData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis domain={[94, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v}%`} width={36} />
              <Tooltip formatter={(v: any) => [`${v}%`]} {...tooltipStyle} />
              <ReferenceLine y={98} stroke="#dc2626" strokeDasharray="4 4" strokeWidth={1.5}
                label={{ value: 'Target', position: 'right', fontSize: 9, fill: '#dc2626' }} />
              <Line type="monotone" dataKey="rate" name="Collection Rate" stroke="#2563eb"
                strokeWidth={2.5} dot={{ r: 3, fill: '#2563eb' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      </div>

      {/* Risk Tier Breakdown + Key Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Risk distribution */}
        <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Risk Tier Breakdown</h2>
          <div className="space-y-4">
            {riskData.map(r => (
              <div key={r.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{r.name}</span>
                  <span className="text-xs font-bold" style={{ color: r.color }}>{r.value} loans</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(r.value / applications.length) * 100}%`, backgroundColor: r.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Sector default rates compact */}
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-white/10">
            <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Default Rates by Sector</h3>
            <div className="space-y-2">
              {sectorTrends.map(s => (
                <div key={s.sector} className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-600 dark:text-gray-400">{s.sector}</span>
                  <span className={`text-[10px] font-bold ${s.defaultRate > 10 ? 'text-red-600' : s.defaultRate > 6 ? 'text-amber-600' : 'text-green-600'}`}>
                    {s.defaultRate}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Insights from Data Mining */}
        <section className="lg:col-span-2 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-center gap-2 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-500/5 dark:to-yellow-500/5">
            <Lightbulb className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Exploratory Data Insights</h2>
          </div>
          <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/60 text-[10px] font-semibold leading-relaxed text-amber-800 dark:border-white/10 dark:bg-amber-500/10 dark:text-amber-300">
            {AI_TRANSPARENCY.shortLabel}: these patterns are operational guidance and should be validated before policy or credit decisions.
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {dataMiningInsights.map(insight => {
              const borderColor = insight.impact === 'Positive' ? 'border-l-green-500' : insight.impact === 'Negative' ? 'border-l-red-500' : 'border-l-gray-300';
              return (
                <div key={insight.id}
                  className={`border-l-4 ${borderColor} pl-3 py-1`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      insight.category === 'Trend' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' :
                      insight.category === 'Pattern' ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400' :
                      insight.category === 'Alert' ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400' :
                      'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    }`}>{insight.category}</span>
                    {insight.affectedSector && (
                      <span className="text-[9px] text-gray-400 dark:text-gray-500 font-semibold">{insight.affectedSector}</span>
                    )}
                  </div>
                  <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 leading-tight">{insight.title}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{insight.description}</p>
                  <p className="text-[9px] text-gray-300 dark:text-gray-600 mt-1">Pattern strength: {insight.confidence}%</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Fix 6: Executive Customer Lifetime Value (LTV) Leaderboard */}
      {(() => {
        const ltvList = customers.map(c =>
          computeCustomerLifetimeValue(c.id, c.name, applications, repayments)
        ).sort((a, b) => b.ltv - a.ltv).slice(0, 5);

        return (
          <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600" /> Executive View — Customer Lifetime Value (LTV) Leaderboard
              </h2>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                Top revenue-generating customer relationships based on interest paid & completed loan cycles.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {ltvList.map((item, idx) => (
                <div key={item.customerId} className="bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 p-3.5 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-400">#{idx + 1} Top Client</span>
                    <span className="text-[9px] font-bold text-green-700 bg-green-50 dark:bg-green-500/10 px-1.5 py-0.5 rounded">
                      {item.completedLoans} Loans
                    </span>
                  </div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{item.customerName}</p>
                  <p className="text-base font-black text-green-600 dark:text-green-400">
                    MWK {item.ltv.toLocaleString()}
                  </p>
                  <p className="text-[9px] text-gray-400 truncate font-mono">
                    Borrowed: MWK {(item.totalBorrowed / 1000000).toFixed(1)}M
                  </p>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* New customers bar chart */}
      <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm p-5">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Customer Acquisition — Monthly Growth</h2>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-5">New customers joining per month</p>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={portfolioTimeline} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={30} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="newCustomers" name="New Customers" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
