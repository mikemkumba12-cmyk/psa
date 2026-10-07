import React, { useMemo, useState } from 'react';
import { PlusCircle, Eye, EyeOff, UploadCloud, HelpCircle, ArrowRight, Rocket, Brain, TrendingUp, Sparkles, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useClientData } from '../context/ClientContext';
import { computeHealthScore, runExpertSystem } from '../lib/intelligenceEngine';
import { AI_TRANSPARENCY } from '../lib/aiTransparency';

interface ClientHomeProps {
  onQuickAction: (action: string) => void;
}

export default function ClientHome({ onQuickAction }: ClientHomeProps) {
  const { session } = useAuth();
  const { applications, repayments } = useClientData();
  const [showBalance, setShowBalance] = useState(true);

  // Find the current active/disbursed application
  const myApp = useMemo(() => {
    return (applications || []).find(a => a.status === 'Disbursed' || a.status === 'Approved' || a.status === 'Under Review') || (applications || [])[0];
  }, [applications]);

  const health = useMemo(() => myApp ? computeHealthScore(myApp) : null, [myApp]);
  const expert = useMemo(() => myApp ? runExpertSystem(myApp) : null, [myApp]);

  // Compute active loan stats dynamically with fallback
  const activeLoanStats = useMemo(() => {
    const activeApp = (applications || []).find(a => a.status === 'Disbursed' || a.status === 'Approved');
    if (!activeApp) return null;

    // Sum unpaid repayments for this application
    const unpaidReps = (repayments || []).filter(r => r.applicationId === activeApp.id && r.status !== 'Paid');
    
    // Fallback: If repayments were created before schedule fix, fallback to activeApp.amount
    const remainingBalance = unpaidReps.length > 0
      ? unpaidReps.reduce((sum, r) => sum + r.amount, 0)
      : activeApp.amount;

    // Find the next upcoming or scheduled payment
    const nextRepayment = unpaidReps.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0] || null;

    const monthlyIncome = Number(session?.monthlyIncome || 350000);
    const availableLimit = Math.max(monthlyIncome * 3 - remainingBalance, 0);

    return {
      activeApp,
      remainingBalance,
      availableLimit,
      nextDueDate: nextRepayment ? nextRepayment.dueDate : '30 days after disbursement',
      hasUnpaid: true,
    };
  }, [applications, repayments, session?.monthlyIncome]);

  return (
    <div className="space-y-6">
      {/* Welcome Message */}
      <section className="mt-2 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Welcome, {session?.fullName || 'Valued Client'}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Your financial health and loan account summary.</p>
        </div>
      </section>

      {/* AI Financial Health Card */}
      {health && expert && (
        <section>
          <div className="rounded-2xl p-5 shadow-sm overflow-hidden relative"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #4c1d95 100%)' }}>
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 70% 20%, #fff 0%, transparent 60%)' }} />
            <div className="relative flex items-center gap-4">
              {/* Mini gauge */}
              <div className="flex-shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" stroke="rgba(255,255,255,0.15)" strokeWidth="7" fill="transparent" />
                  <circle cx="40" cy="40" r="32"
                    stroke={health.tierColor}
                    strokeWidth="7" fill="transparent"
                    strokeDasharray={2 * Math.PI * 32}
                    strokeDashoffset={2 * Math.PI * 32 * (1 - health.composite / 100)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'translateY(-4px) translateX(0px)', position: 'relative', marginTop: '-76px' }}>
                  <div className="text-center">
                    <span className="text-2xl font-black text-white leading-none">{health.composite}</span>
                    <span className="block text-[9px] font-bold text-white/60 uppercase tracking-wider">/100</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Brain className="w-3.5 h-3.5 text-white/80" />
                  <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Rules-Based Guidance</span>
                </div>
                <p className="text-white font-black text-base leading-tight">Financial Health Estimate: {health.tier}</p>
                <p className="text-white/70 text-[11px] mt-1 leading-relaxed line-clamp-2">{expert.primaryReason}</p>
                <p className="mt-1 text-[9px] font-semibold leading-relaxed text-white/60">{AI_TRANSPARENCY.decisionDisclaimer}</p>
                <button
                  onClick={() => onQuickAction('advisor')}
                  className="mt-2.5 flex items-center gap-1 text-[11px] font-bold text-white bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full transition-colors"
                >
                  <Sparkles className="w-3 h-3" /> Ask Advisor <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              {expert.verdict === 'Approve' && (
                <div className="flex-shrink-0 flex flex-col items-center">
                  <TrendingUp className="w-6 h-6 text-green-400" />
                  <span className="text-[9px] font-bold text-green-400 mt-0.5">Review Ready</span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Hero Card: Current Loan Summary with Hide/Show Toggle */}
      {activeLoanStats ? (
        <section>
          <div className="bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-white/10 rounded-2xl p-6 shadow-sm relative overflow-hidden space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Loan Account Balance</p>
                <button
                  onClick={() => setShowBalance(!showBalance)}
                  className="text-gray-400 hover:text-orange-500 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
                  title={showBalance ? 'Hide balance' : 'Show balance'}
                >
                  {showBalance ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
              <div className="bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border border-green-200 dark:border-green-500/20">
                {activeLoanStats.activeApp.status}
              </div>
            </div>

            {/* Balances Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold block uppercase tracking-wider">Remaining Outstanding</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-3xl font-black text-orange-600 dark:text-orange-400">
                    {showBalance ? `K ${activeLoanStats.remainingBalance.toLocaleString()}` : 'K •••••••••'}
                  </span>
                  {showBalance && <span className="text-sm font-bold text-gray-400">.00</span>}
                </div>
              </div>
              <div>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold block uppercase tracking-wider">Pre-Approved Available Limit</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {showBalance ? `K ${activeLoanStats.availableLimit.toLocaleString()}` : 'K •••••••••'}
                  </span>
                  {showBalance && <span className="text-xs font-semibold text-gray-400">.00</span>}
                </div>
              </div>
            </div>

            {/* Footer row */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-white/10">
              <div className="space-y-0.5">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">Next Payment Due</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{activeLoanStats.nextDueDate}</p>
              </div>
              <button 
                onClick={() => onQuickAction('view_loan')}
                className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 hover:brightness-105 transition-all"
              >
                View Repayment Details &rarr;
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section>
          <div className="bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-white/10 rounded-2xl p-6 shadow-sm relative overflow-hidden text-center py-8">
            <Rocket className="w-8 h-8 text-orange-500 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-bold text-gray-900 dark:text-white">No Active Loans</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[280px] mx-auto">Use the loan calculator to submit a new financing application or check pre-approved rates.</p>
            <button
              onClick={() => onQuickAction('apply_loan')}
              className="mt-4 bg-orange-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 hover:bg-orange-600 transition-colors"
            >
              Calculate & Apply Now
            </button>
          </div>
        </section>
      )}

      {/* Quick Actions Grid */}
      <section className="space-y-3">
        <h3 className="text-[11px] font-bold text-secondary uppercase tracking-widest">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Action 1 */}
          <button 
            onClick={() => onQuickAction('apply_loan')}
            className="bg-white border border-outline-variant rounded-2xl p-4 flex flex-col items-center justify-center gap-3 aspect-square active:scale-95 transition-transform hover:bg-surface-container-low"
          >
            <div className="w-12 h-12 rounded-full bg-primary-container/10 flex items-center justify-center">
              <PlusCircle className="text-primary w-7 h-7" />
            </div>
            <span className="text-xs font-semibold text-center leading-tight">Apply for Loan</span>
          </button>

          {/* Action 2 */}
          <button 
            onClick={() => onQuickAction('view_loan')}
            className="bg-white border border-outline-variant rounded-2xl p-4 flex flex-col items-center justify-center gap-3 aspect-square active:scale-95 transition-transform hover:bg-surface-container-low"
          >
            <div className="w-12 h-12 rounded-full bg-primary-container/10 flex items-center justify-center">
              <Eye className="text-primary w-7 h-7" />
            </div>
            <span className="text-xs font-semibold text-center leading-tight">View Loan</span>
          </button>

          {/* Action 3 */}
          <button 
            onClick={() => onQuickAction('upload_docs')}
            className="bg-white border border-outline-variant rounded-2xl p-4 flex flex-col items-center justify-center gap-3 aspect-square active:scale-95 transition-transform hover:bg-surface-container-low"
          >
            <div className="w-12 h-12 rounded-full bg-primary-container/10 flex items-center justify-center">
              <UploadCloud className="text-primary w-7 h-7" />
            </div>
            <span className="text-xs font-semibold text-center leading-tight">Upload Documents</span>
          </button>

          {/* Action 4 */}
          <button 
            onClick={() => onQuickAction('contact')}
            className="bg-white border border-outline-variant rounded-2xl p-4 flex flex-col items-center justify-center gap-3 aspect-square active:scale-95 transition-transform hover:bg-surface-container-low"
          >
            <div className="w-12 h-12 rounded-full bg-primary-container/10 flex items-center justify-center">
              <HelpCircle className="text-primary w-7 h-7" />
            </div>
            <span className="text-xs font-semibold text-center leading-tight">Contact Pinnacle</span>
          </button>
        </div>
      </section>

      {/* Promotional / Info Section (Bento Lite) */}
      <section>
        <div className="bg-[#00abf3]/5 border border-[#00abf3]/25 rounded-2xl p-5 flex gap-4 items-center">
          <div className="flex-grow space-y-1">
            <h4 className="font-bold text-base text-[#003c58]">Small Business Grant</h4>
            <p className="text-xs text-[#003c58]/80 leading-relaxed">Check your eligibility for the new SME support program.</p>
          </div>
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
            <Rocket className="text-tertiary w-6 h-6 animate-pulse" />
          </div>
        </div>
      </section>
    </div>
  );
}
