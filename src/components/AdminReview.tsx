import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, CheckCircle2, AlertTriangle, HelpCircle, FileText, X, Eye, ThumbsUp, ThumbsDown, Brain, ShieldAlert, Sparkles, XCircle, FileQuestion, Download } from 'lucide-react';
import { LoanApplication } from '../types';
import { runExpertSystem, detectFraudFlags } from '../lib/intelligenceEngine';
import { documentsStore, type StoredDocument } from '../lib/store';
import { AI_TRANSPARENCY } from '../lib/aiTransparency';
import { useAuth } from '../auth/AuthContext';
import DocumentVerificationPanel from './DocumentVerificationPanel';

interface AdminReviewProps {
  application: LoanApplication;
  onBack: () => void;
  onUpdateStatus: (id: string, newStatus: LoanApplication['status'], notes?: string) => void;
}

export default function AdminReview({ application, onBack, onUpdateStatus }: AdminReviewProps) {
  const { session } = useAuth();
  const [decisionNotes, setDecisionNotes] = useState(application.notes || '');
  const [activeDocView, setActiveDocView] = useState<'id' | 'address' | null>(null);
  const [userDocs, setUserDocs] = useState<StoredDocument[]>([]);

  useEffect(() => {
    // Use application.userId for correct document lookup
    const ownerId = application.userId || '';
    const allDocs = documentsStore.getAll();
    const filtered = allDocs.filter(d => d.userId === ownerId);
    setUserDocs(filtered);
  }, [application]);

  const handleDecision = (status: LoanApplication['status']) => {
    onUpdateStatus(application.id, status, decisionNotes);
  };

  // Intelligence engine
  const expertRec = useMemo(() => runExpertSystem(application), [application]);
  const fraudFlags = useMemo(() => detectFraudFlags([application]), [application]);
  const { healthScore, rulesFired, verdict, confidence, segment } = expertRec;

  // Circular gauge calculations
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (application.score / 100) * circumference;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center gap-3 border-b border-surface-container pb-4">
        <button 
          onClick={onBack}
          className="p-1 text-primary hover:bg-surface-container rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <span className="text-[10px] font-bold text-secondary uppercase tracking-widest font-mono">Operations assessment</span>
          <div className="flex items-center gap-2 mt-0.5">
            <h1 className="text-lg font-bold text-on-surface">Application review: #{application.id}</h1>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              application.dataSource === 'demo' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300' :
              application.dataSource === 'imported' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/20 dark:text-blue-300' :
              'bg-green-100 text-green-800 dark:bg-green-950/20 dark:text-green-300'
            }`}>
              {application.dataSource === 'demo' ? 'Demo Data' :
               application.dataSource === 'imported' ? 'Imported' :
               'User Submission'}
            </span>
          </div>
          <p className="mt-1 text-[10px] font-semibold text-secondary">{AI_TRANSPARENCY.decisionDisclaimer}</p>
        </div>
      </div>

      {/* Main Grid split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column (Detailed profile indicators) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Info Card */}
          <section className="bg-white border border-outline-variant rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-on-surface">{application.applicantName}</h2>
                <p className="text-sm font-semibold text-primary">{application.businessName}</p>
                <p className="text-xs text-secondary mt-0.5">{application.sector} • {application.yearsInBusiness} in business</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                application.status === 'Approved' ? 'bg-green-50 text-green-700 border border-green-200' :
                application.status === 'Decline' ? 'bg-red-50 text-red-700 border border-red-200' :
                'bg-yellow-50 text-yellow-700 border border-yellow-200'
              }`}>
                {application.status}
              </span>
            </div>

            {/* Financial indicators grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-surface-container">
              <div>
                <span className="text-[9px] font-bold text-secondary uppercase block">Requested Amount</span>
                <p className="text-base font-bold text-primary mt-0.5">K {application.amount.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-secondary uppercase block">Monthly Revenue</span>
                <p className="text-base font-bold text-on-surface mt-0.5">K {application.monthlyRevenue.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-secondary uppercase block">Debt-to-Income (DTI)</span>
                <p className="text-base font-bold text-on-surface mt-0.5">{application.debtToIncome}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-secondary uppercase block">Staff Headcount</span>
                <p className="text-base font-bold text-on-surface mt-0.5">{application.staffCount} Employees</p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-secondary uppercase block">Repayment History</span>
                <p className="text-base font-bold text-green-700 mt-0.5">{application.repaymentHistory}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-secondary uppercase block">Branch Contact</span>
                <p className="text-base font-bold text-on-surface mt-0.5">{application.phone.slice(0, 8)}...</p>
              </div>
            </div>
          </section>

          {/* Compliance documents viewer area */}
          <section className="bg-white border border-outline-variant rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-on-surface">Compliance Verified Documents</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Document ID */}
              <div className="p-4 border border-outline-variant rounded-xl flex items-center justify-between hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-on-surface">National ID Scan</h4>
                    <p className="text-[10px] text-secondary">Verified • JPEG (1.2 MB)</p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveDocView('id')}
                  className="p-2 hover:bg-primary/5 text-primary rounded-lg transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>

              {/* Document Address */}
              <div className="p-4 border border-outline-variant rounded-xl flex items-center justify-between hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-on-surface">Proof of Residence</h4>
                    <p className="text-[10px] text-secondary">Verified • PNG (0.8 MB)</p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveDocView('address')}
                  className="p-2 hover:bg-primary/5 text-primary rounded-lg transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>

          {/* Expert System Panel */}
          <section className="bg-white border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-container flex items-center gap-2 bg-gradient-to-r from-violet-50 to-purple-50">
              <Brain className="w-4 h-4 text-violet-600" />
              <h3 className="text-xs font-bold text-on-surface">Rules-Based Assessment</h3>
              {/* Verdict badge */}
              <span className={`ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                verdict === 'Approve' ? 'bg-green-50 border-green-200 text-green-700' :
                verdict === 'Decline' ? 'bg-red-50 border-red-200 text-red-700' :
                verdict === 'Request Docs' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                'bg-blue-50 border-blue-200 text-blue-700'
              }`}>
                {verdict === 'Approve' ? <CheckCircle2 className="w-3 h-3" /> :
                 verdict === 'Decline' ? <XCircle className="w-3 h-3" /> :
                 verdict === 'Request Docs' ? <FileQuestion className="w-3 h-3" /> :
                 <HelpCircle className="w-3 h-3" />}
                {verdict}
              </span>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                <p className="text-[10px] font-semibold leading-relaxed text-amber-800">
                  <span className="font-black">{AI_TRANSPARENCY.modelLabel}.</span> {AI_TRANSPARENCY.decisionDisclaimer}
                </p>
              </div>
              <p className="text-xs text-on-surface leading-relaxed">{expertRec.explanation}</p>

              {/* Confidence */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] font-bold text-secondary">Rule Match Strength</span>
                  <span className="text-[10px] font-bold text-violet-600">{confidence}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${confidence}%` }} />
                </div>
              </div>

              {/* Financial health sub-scores */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Repayment', val: healthScore.repaymentScore },
                  { label: 'Income', val: healthScore.incomeStabilityScore },
                  { label: 'Debt', val: healthScore.debtScore },
                  { label: 'Business', val: healthScore.businessScore },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[9px] font-bold text-secondary uppercase">{label}</span>
                      <span className="text-[9px] font-bold" style={{ color: val >= 80 ? '#16a34a' : val >= 60 ? '#d97706' : '#dc2626' }}>{val}</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${val}%`, backgroundColor: val >= 80 ? '#16a34a' : val >= 60 ? '#d97706' : '#dc2626' }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Rules fired */}
              {rulesFired.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-secondary uppercase tracking-widest mb-1.5">Rules Matched</p>
                  <div className="flex flex-wrap gap-1">
                    {rulesFired.map(r => (
                      <span key={r.id} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                        {r.id}: {r.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Fraud flags */}
              {fraudFlags.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                    <span className="text-[10px] font-bold text-red-700">Rules-Based Fraud Signals ({fraudFlags.length})</span>
                  </div>
                  {fraudFlags.map(f => (
                    <p key={f.id} className="text-[10px] text-red-600 leading-relaxed">• {f.signal}: {f.description}</p>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-secondary uppercase">Segment:</span>
                <span className="text-[10px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">{segment}</span>
                <span className="text-[9px] font-bold text-secondary uppercase ml-auto">Health:</span>
                <span className="text-[10px] font-bold" style={{ color: healthScore.tierColor }}>{healthScore.composite}/100 · {healthScore.tier}</span>
              </div>
            </div>
          </section>
        </div>

        {/* Right column (Risk Score Gauge & Decision Form) */}
        <div className="space-y-6">
          {/* Risk Gauge box */}
          <section className="bg-white border border-outline-variant rounded-2xl p-6 shadow-sm text-center space-y-4">
            <h3 className="text-xs font-bold text-secondary uppercase tracking-widest">Rules-Based Risk Rating</h3>
            
            {/* Circular Gauge */}
            <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                {/* Background path */}
                <circle 
                  cx="72" cy="72" r={radius} 
                  stroke="#f1f5f9" strokeWidth="10" fill="transparent" 
                />
                {/* Score path */}
                <circle 
                  cx="72" cy="72" r={radius} 
                  stroke={application.score >= 80 ? '#22c55e' : application.score >= 60 ? '#f59e0b' : '#ef4444'} 
                  strokeWidth="10" fill="transparent" 
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-3xl font-black text-on-surface">{application.score}</span>
                <span className="text-[10px] text-secondary font-bold uppercase tracking-wider">Score</span>
              </div>
            </div>

            <div>
              <p className={`text-base font-bold ${
                application.riskLevel === 'Low' ? 'text-green-700' :
                application.riskLevel === 'Medium' ? 'text-yellow-700' : 'text-red-700'
              }`}>
                {application.riskLevel} Risk Profile
              </p>
              <p className="text-xs text-secondary mt-1">Rules-based estimate; not a final credit decision.</p>
            </div>
          </section>

          {/* Document Verification Panel */}
          <section className="bg-white border border-outline-variant rounded-2xl p-5 shadow-sm">
            <DocumentVerificationPanel
              applicationId={application.id}
              userId={application.userId}
            />
          </section>

          {/* Officer Form Notes Area */}
          <section className="bg-white border border-outline-variant rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-secondary uppercase tracking-widest">Officer Action Notes</h3>
            <textarea 
              rows={4}
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              placeholder="Provide a reason or add instructions here for verification auditors..."
              className="w-full text-xs border border-outline-variant/60 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-primary font-medium leading-relaxed"
            />

            {/* Decision buttons list */}
            <div className="space-y-2 pt-2">
              <button 
                onClick={() => handleDecision('Approved')}
                className="w-full py-3 bg-green-700 hover:bg-green-800 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98]"
              >
                <ThumbsUp className="w-4 h-4" /> Approve After Review
              </button>
              
              <button 
                onClick={() => handleDecision('Decline')}
                className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98]"
              >
                <ThumbsDown className="w-4 h-4" /> Decline Portfolio
              </button>

              <button 
                onClick={() => handleDecision('Pending Doc')}
                className="w-full py-3 bg-surface-container hover:bg-surface-container-high text-secondary font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <HelpCircle className="w-4 h-4" /> Request More Info
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* DOCUMENT IMAGE MODAL VIEWER */}
      {activeDocView && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            {/* Close */}
            <button 
              onClick={() => setActiveDocView(null)}
              className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 p-2 rounded-full text-white z-10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Uploaded Documents list (new UI) */}
        </div>
      )}
    </div>
  );
}
