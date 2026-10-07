import React, { useMemo } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck, ChevronRight, FileText } from 'lucide-react';
import type { LoanApplication, ExpertRecommendation } from '../types';
import { computeCreditRecommendation } from '../lib/intelligenceEngine';
import { applicationsStore, repaymentsStore, payrollStore } from '../lib/store';

interface AIAssessmentModalProps {
  data: {
    application: LoanApplication;
    assessment: ExpertRecommendation;
  };
  onClose: () => void;
}

export default function AIAssessmentModal({ data, onClose }: AIAssessmentModalProps) {
  const { application, assessment } = data;

  // Load full context from store for payroll + repeat-loan signal evaluation
  const allApplications = useMemo(() => applicationsStore.getAllUnfiltered(), []);
  const allRepayments   = useMemo(() => repaymentsStore.getAllUnfiltered(), []);
  const payrollRecords  = useMemo(() => payrollStore.getAllRecords(), []);

  const creditRec = useMemo(
    () => computeCreditRecommendation(application, { allApplications, allRepayments, payrollRecords }),
    [application, allApplications, allRepayments, payrollRecords]
  );
  const { recommendation, score, riskLevel, positiveSignals, riskFactors, suggestedAction } = creditRec;

  const recConfig = {
    Approve: {
      badgeBg: 'bg-green-500 text-white',
      border: 'border-green-200 dark:border-green-800',
      bgLight: 'bg-green-50 dark:bg-green-950/40',
      text: 'text-green-700 dark:text-green-400',
      icon: CheckCircle2,
      label: 'Recommendation: Approve',
    },
    Decline: {
      badgeBg: 'bg-red-500 text-white',
      border: 'border-red-200 dark:border-red-800',
      bgLight: 'bg-red-50 dark:bg-red-950/40',
      text: 'text-red-700 dark:text-red-400',
      icon: XCircle,
      label: 'Recommendation: Decline',
    },
    Review: {
      badgeBg: 'bg-amber-500 text-white',
      border: 'border-amber-200 dark:border-amber-800',
      bgLight: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-400',
      icon: AlertTriangle,
      label: 'Recommendation: Officer Manual Review',
    },
  }[recommendation];

  const RecIcon = recConfig.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#1a1a1a] border border-outline-variant rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl space-y-0">
        
        {/* Header banner */}
        <div className="p-6 bg-gradient-to-r from-orange-600 via-amber-600 to-slate-900 text-white relative">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-200 uppercase tracking-widest mb-1">
            <ShieldCheck className="w-4 h-4 text-amber-400" /> PINACO Credit Intelligence Engine
          </div>
          <h2 className="text-xl font-black">Application #{application.id}</h2>
          <p className="text-xs text-white/80 mt-1">
            Applicant: <strong className="text-white">{application.applicantName}</strong> &bull; Amount: <strong className="text-white">MWK {application.amount.toLocaleString()}</strong>
          </p>
        </div>

        {/* Modal content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          
          {/* Recommendation Badge */}
          <div className={`p-4 rounded-2xl border ${recConfig.border} ${recConfig.bgLight} flex items-start gap-3`}>
            <div className={`w-10 h-10 rounded-xl ${recConfig.badgeBg} flex items-center justify-center flex-shrink-0 shadow-md`}>
              <RecIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${recConfig.text}`}>
                  {recConfig.label}
                </span>
                <span className="text-[10px] bg-white/80 dark:bg-black/30 font-mono font-semibold px-2 py-0.5 rounded text-gray-700 dark:text-gray-300">
                  {score}/100 Score
                </span>
              </div>
              <p className="text-xs font-bold text-gray-900 dark:text-white mt-1">
                Risk Profile: <span className={riskLevel === 'Low' ? 'text-green-600' : riskLevel === 'Medium' ? 'text-amber-600' : 'text-red-600'}>{riskLevel} Risk</span>
              </p>
            </div>
          </div>

          {/* Positive Signals (✓) */}
          {positiveSignals.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Positive Credit Factors
              </h4>
              <div className="space-y-1.5">
                {positiveSignals.map((sig, i) => (
                  <div key={i} className="text-xs text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950/20 p-2.5 rounded-xl border border-green-200 dark:border-green-900/30 font-medium">
                    {sig}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk Factors (⚠) */}
          {riskFactors.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Risk Factors Flagged
              </h4>
              <div className="space-y-1.5">
                {riskFactors.map((rf, i) => (
                  <div key={i} className="text-xs text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/20 p-2.5 rounded-xl border border-red-200 dark:border-red-900/30 font-medium">
                    {rf}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Action */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 space-y-1">
            <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-amber-600" /> Suggested Officer Action
            </h4>
            <p className="text-xs text-amber-900 dark:text-amber-200 font-semibold leading-relaxed">
              {suggestedAction}
            </p>
          </div>

          {/* Compliance Notice */}
          <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center italic">
            This evaluation is an explainable decision aid. The assigned PINACO Loan Officer makes the final lending decision.
          </p>

        </div>

        {/* Footer CTA */}
        <div className="p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 flex justify-end">
          <button
            onClick={onClose}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-1.5 active:scale-95"
          >
            Close Assessment <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
