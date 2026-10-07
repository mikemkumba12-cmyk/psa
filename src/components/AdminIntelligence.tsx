import React, { useMemo, useState } from 'react';
import { repaymentsStore, customersStore, payrollStore } from '../lib/store';
import {
  Brain, ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  HelpCircle, FileQuestion, Sparkles, TrendingUp, TrendingDown,
  Minus, Users, ChevronRight, Activity, Zap, Target,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useAdminData } from '../context/AdminContext';
import {
  runExpertSystem, detectFraudFlags,
  computeDynamicSectorTrends, generateDynamicInsights,
  computeSegmentDistribution, SEGMENT_COLORS,
} from '../lib/intelligenceEngine';
import { AI_TRANSPARENCY } from '../lib/aiTransparency';
import type { ExpertRecommendation, LoanApplication } from '../types';
import TopUpOpportunitiesCard from './TopUpOpportunitiesCard';

// ── Verdict chip ─────────────────────────────────────────────────────────────
function VerdictBadge({ verdict }: { verdict: ExpertRecommendation['verdict'] }) {
  const cfg = {
    Approve: { bg: 'bg-green-50 border-green-200 text-green-700 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-400', Icon: CheckCircle2 },
    Decline: { bg: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400', Icon: XCircle },
    'Request Docs': { bg: 'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-500/10 dark:border-yellow-500/20 dark:text-yellow-400', Icon: FileQuestion },
    Review: { bg: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400', Icon: HelpCircle },
  }[verdict];
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${cfg.bg}`}>
      <Icon className="w-3 h-3" />{verdict}
    </span>
  );
}

// ── Confidence bar ────────────────────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 85 ? 'bg-green-500' : value >= 70 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 w-8 text-right">{value}%</span>
    </div>
  );
}

// ── Custom Pie label ──────────────────────────────────────────────────────────
const RADIAN = Math.PI / 180;
function CustomPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.08) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      fontSize={10} fontWeight="bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function AdminIntelligence() {
  const { applications } = useAdminData();

  // Live store data for dynamic computations
  const repayments = useMemo(() => repaymentsStore.getAllUnfiltered(), []);
  const customers = useMemo(() => customersStore.getAll(), []);
  const payrollRecords = useMemo(() => payrollStore.getAllRecords(), []);

  const pendingApps = useMemo(
    () => applications.filter(a => ['Under Review', 'In Progress', 'Reviewing'].includes(a.status)),
    [applications]
  );

  const expertResults = useMemo(
    () => applications.map(app => ({ app, rec: runExpertSystem(app) })),
    [applications]
  );

  const pendingResults = useMemo(
    () => pendingApps.map(app => ({ app, rec: runExpertSystem(app) })),
    [pendingApps]
  );

  const fraudFlags = useMemo(() => detectFraudFlags(applications), [applications]);
  const segmentData = useMemo(() => computeSegmentDistribution(applications), [applications]);

  // Dynamic — computed from live data, not static arrays
  const sectorTrends = useMemo(
    () => computeDynamicSectorTrends(applications, repayments),
    [applications, repayments]
  );
  const dataMiningInsights = useMemo(
    () => generateDynamicInsights(applications, repayments, customers, payrollRecords),
    [applications, repayments, customers, payrollRecords]
  );

  const [activeInsight, setActiveInsight] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-md shadow-purple-500/30">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Intelligence Center</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 ml-10">
            Rules-based guidance · Data patterns · Customer segmentation · Fraud signals
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-bold text-green-700 dark:text-green-400">Rules Engine Active</span>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/10">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
        <p className="text-[10px] font-semibold leading-relaxed text-amber-800 dark:text-amber-300">
          <span className="font-black">{AI_TRANSPARENCY.modelLabel}.</span> {AI_TRANSPARENCY.decisionDisclaimer} {AI_TRANSPARENCY.dataBasis}
        </p>
      </div>

      {/* Top KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Rule Matches', value: expertResults.filter(r => r.rec.confidence >= 80).length, sub: 'High-strength guidance', Icon: Zap, color: 'text-violet-600 bg-violet-50 dark:bg-violet-500/10' },
          { label: 'Fraud Signals', value: fraudFlags.length, sub: 'Applications flagged', Icon: ShieldAlert, color: 'text-red-600 bg-red-50 dark:bg-red-500/10' },
          { label: 'Approve Guidance', value: pendingResults.filter(r => r.rec.verdict === 'Approve').length, sub: 'Needs officer review', Icon: CheckCircle2, color: 'text-green-600 bg-green-50 dark:bg-green-500/10' },
          { label: 'Review Queue', value: pendingResults.filter(r => r.rec.verdict !== 'Approve').length, sub: 'Needs attention', Icon: Target, color: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10' },
        ].map(({ label, value, sub, Icon, color }) => (
          <div key={label} className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{label}</span>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-gray-900 dark:text-white">{value}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Expert System Verdicts */}
        <section className="lg:col-span-2 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-center gap-2 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-500/5 dark:to-purple-500/5">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Rules-Based Pending Queue Guidance</h2>
          </div>
          <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/60 text-[10px] font-semibold leading-relaxed text-amber-800 dark:border-white/10 dark:bg-amber-500/10 dark:text-amber-300">
            {AI_TRANSPARENCY.shortLabel}: outputs flag patterns for review; they do not approve, decline, or disburse funds.
          </div>
          <div className="divide-y divide-gray-50 dark:divide-white/5">
            {pendingResults.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">No pending applications.</p>
            )}
            {pendingResults.map(({ app, rec }) => (
              <div key={app.id} className="p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-900 dark:text-white">{app.applicantName}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">#{app.id}</span>
                      <VerdictBadge verdict={rec.verdict} />
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{rec.primaryReason}</p>
                    <div className="mt-2">
                      <ConfidenceBar value={rec.confidence} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-violet-600 dark:text-violet-400">
                      MWK {app.amount.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{rec.segment}</p>
                  </div>
                </div>
                {/* Rules fired */}
                {rec.rulesFired.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {rec.rulesFired.map(r => (
                      <span key={r.id} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-500/20">
                        {r.id}: {r.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Customer Segmentation */}
        <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Customer Segmentation</h2>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={segmentData}
                  dataKey="count"
                  nameKey="segment"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  innerRadius={35}
                  labelLine={false}
                  label={CustomPieLabel}
                >
                  {segmentData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any, name: any) => [`${val} customers`, name]}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="space-y-2 mt-2">
              {segmentData.map(seg => (
                <div key={seg.segment} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                  <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 flex-1">{seg.segment}</span>
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{seg.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Second row: Fraud Flags + Exploratory Data Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Fraud Detection Feed */}
        <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-center gap-2 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-500/5 dark:to-orange-500/5">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Rules-Based Fraud Signals</h2>
            {fraudFlags.length > 0 && (
              <span className="ml-auto px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
                {fraudFlags.length}
              </span>
            )}
          </div>
          <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/60 text-[10px] font-semibold leading-relaxed text-amber-800 dark:border-white/10 dark:bg-amber-500/10 dark:text-amber-300">
            {AI_TRANSPARENCY.shortLabel}: outputs flag patterns for review; they do not approve, decline, or disburse funds.
          </div>
          <div className="divide-y divide-gray-50 dark:divide-white/5">
            {fraudFlags.length === 0 && (
              <div className="p-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No fraud signals detected.</p>
              </div>
            )}
            {fraudFlags.map(flag => (
              <div key={flag.id} className="p-4 flex gap-3">
                <div className={`mt-0.5 w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center ${
                  flag.severity === 'High' ? 'bg-red-100 dark:bg-red-500/10' : 'bg-amber-100 dark:bg-amber-500/10'
                }`}>
                  <AlertTriangle className={`w-3.5 h-3.5 ${flag.severity === 'High' ? 'text-red-600' : 'text-amber-600'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-900 dark:text-white">{flag.signal}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      flag.severity === 'High'
                        ? 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400'
                        : 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    }`}>{flag.severity}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">{flag.applicationId}</p>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{flag.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Exploratory Data Insights */}
        <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Exploratory Data Insights</h2>
          </div>
          <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/60 text-[10px] font-semibold leading-relaxed text-amber-800 dark:border-white/10 dark:bg-amber-500/10 dark:text-amber-300">
            {AI_TRANSPARENCY.shortLabel}: outputs flag patterns for review; they do not approve, decline, or disburse funds.
          </div>
          <div className="divide-y divide-gray-50 dark:divide-white/5">
            {dataMiningInsights.map(insight => {
              const isActive = activeInsight === insight.id;
              const ImpactIcon = insight.impact === 'Positive' ? TrendingUp : insight.impact === 'Negative' ? TrendingDown : Minus;
              const impactColor = insight.impact === 'Positive' ? 'text-green-600' : insight.impact === 'Negative' ? 'text-red-600' : 'text-gray-400';
              const catColor: Record<string, string> = {
                Trend: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
                Pattern: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400',
                Alert: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400',
                Anomaly: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
              };
              return (
                <button
                  key={insight.id}
                  onClick={() => setActiveInsight(isActive ? null : insight.id)}
                  className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <ImpactIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${impactColor}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-gray-900 dark:text-white">{insight.title}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${catColor[insight.category]}`}>
                          {insight.category}
                        </span>
                      </div>
                      {isActive && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                          {insight.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[10px] font-bold text-gray-400">{insight.confidence}%</span>
                      <ChevronRight className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isActive ? 'rotate-90' : ''}`} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Repeat Borrower Top-Up Opportunities */}
      <TopUpOpportunitiesCard
        customers={customers}
        applications={applications}
        repayments={repayments}
        payrollRecords={payrollRecords}
      />

      {/* Sector Risk Heatmap */}
      <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-600" />
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Sector Risk Heatmap</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/10">
                {['Sector', 'Default Rate', 'Avg Repayment', 'Total Disbursed', 'Growth', 'Risk', 'Insight'].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {sectorTrends.map(s => (
                <tr key={s.sector} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-bold text-gray-900 dark:text-white whitespace-nowrap">{s.sector}</td>
                  <td className={`px-4 py-3 font-bold ${s.defaultRate > 10 ? 'text-red-600' : s.defaultRate > 6 ? 'text-amber-600' : 'text-green-600'}`}>
                    {s.defaultRate}%
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.avgRepayment}%</td>
                  <td className="px-4 py-3 text-violet-600 dark:text-violet-400 font-semibold">
                    MWK {(s.totalDisbursed / 1000000).toFixed(1)}M
                  </td>
                  <td className={`px-4 py-3 font-bold ${s.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {s.growth >= 0 ? '+' : ''}{s.growth}%
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      s.riskRating === 'Low' ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20' :
                      s.riskRating === 'Medium' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20' :
                      'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20'
                    }`}>{s.riskRating}</span>
                  </td>
                  <td className="px-4 py-3 text-[10px] text-gray-500 dark:text-gray-400 max-w-xs">{s.insight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
