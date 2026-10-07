import React, { useMemo } from 'react';
import {
  X, User, Building2, Briefcase, Calendar, ShieldCheck, AlertTriangle,
  CheckCircle2, DollarSign, Activity, TrendingUp, History, FileText, Sparkles, Clock,
} from 'lucide-react';
import type { Customer, LoanApplication, Repayment, PayrollRecord, AuditLogEntry } from '../types';
import {
  computeCustomerRelationshipScore,
  computeCustomerRiskTimeline,
  computeCustomerLifetimeValue,
} from '../lib/intelligenceEngine';

interface Customer360ModalProps {
  customer: Customer;
  applications: LoanApplication[];
  repayments: Repayment[];
  payrollRecords: PayrollRecord[];
  auditLogs?: AuditLogEntry[];
  onClose: () => void;
}

export default function Customer360Modal({
  customer,
  applications,
  repayments,
  payrollRecords,
  auditLogs = [],
  onClose,
}: Customer360ModalProps) {
  // Filter customer-specific data
  const custApps = useMemo(
    () => applications.filter(a => a.userId === customer.userId || a.id === customer.id || a.applicantName.toLowerCase() === customer.name.toLowerCase()),
    [applications, customer]
  );

  const custReps = useMemo(
    () => repayments.filter(r =>
      // Match via applicationId (standard loan repayments)
      custApps.some(a => a.id === r.applicationId) ||
      // Also match via userId directly (payroll deduction repayments may lack applicationId)
      (customer.userId && r.userId === customer.userId)
    ),
    [repayments, custApps, customer.userId]
  );

  // 1. Customer Relationship Score
  const scoreResult = useMemo(
    () => computeCustomerRelationshipScore(customer.id, custApps, custReps, payrollRecords),
    [customer.id, custApps, custReps, payrollRecords]
  );

  // 2. Risk Evolution Timeline
  const timelineEvents = useMemo(
    () => computeCustomerRiskTimeline(customer.id, custApps, custReps, auditLogs),
    [customer.id, custApps, custReps, auditLogs]
  );

  // 3. Customer Lifetime Value
  const ltvResult = useMemo(
    () => computeCustomerLifetimeValue(customer.id, customer.name, custApps, custReps),
    [customer.id, customer.name, custApps, custReps]
  );

  // Determine Customer Type
  const completedLoansCount = custApps.filter(a => a.status === 'Completed').length;
  const customerTypeLabel = completedLoansCount >= 1 ? 'Repeat Borrower' : (customer.customerType || 'Existing');

  // Primary app reference for salary/employer details
  const primaryApp = custApps[0];
  const employerName = primaryApp?.businessName || primaryApp?.sector || customer.sector || 'Unspecified Employer';
  const monthlySalary = primaryApp?.monthlyRevenue || 0;
  const maskedNationalId = customer.employeeNumber ? `EMP-${customer.employeeNumber}` : 'NID-XXXX-XXXX-8821';

  // Employer payroll reliability from payroll records
  const empPayrollRecords = payrollRecords.filter(p => p.employer.toLowerCase() === employerName.toLowerCase());
  const matchedPayrollCount = empPayrollRecords.filter(p => p.status === 'Matched' || p.status === 'Applied').length;
  const payrollReliabilityDisplay = empPayrollRecords.length > 0
    ? `${Math.round((matchedPayrollCount / empPayrollRecords.length) * 100)}%`
    : 'No Payroll Data';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#1a1a1a] border border-outline-variant rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white flex justify-between items-start flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white/10 text-purple-200 border border-purple-400/20">
                Customer 360 Profile
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
                customerTypeLabel === 'Repeat Borrower' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                customerTypeLabel === 'Existing' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {customerTypeLabel}
              </span>
            </div>
            <h2 className="text-2xl font-black text-white">{customer.name}</h2>
            <p className="text-xs text-gray-300 mt-1 flex items-center gap-3">
              <span>National ID: <strong>{maskedNationalId}</strong></span>
              <span>•</span>
              <span>Phone: <strong>{customer.phone || '+265 888 123 456'}</strong></span>
              <span>•</span>
              <span>Location: <strong>{customer.location}, Malawi</strong></span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full text-white/80 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">

          {/* Top Row: Relationship Score + Employment Intel + LTV */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Customer Relationship Score (0-100) */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border border-purple-200 dark:border-purple-900/40 p-4 rounded-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-purple-800 dark:text-purple-300 uppercase tracking-widest">
                  Relationship Score
                </span>
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>

              <div className="my-3 flex items-baseline gap-2">
                {scoreResult.score === -1 ? (
                  <div>
                    <span className="text-2xl font-black text-amber-600">New</span>
                    <span className="text-xs font-semibold text-gray-500 ml-1">Customer</span>
                  </div>
                ) : (
                  <div>
                    <span className="text-4xl font-black text-purple-900 dark:text-purple-100">
                      {scoreResult.score}
                    </span>
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400">/100</span>
                  </div>
                )}
                <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  scoreResult.tier === 'High' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
                  scoreResult.tier === 'Good' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                  scoreResult.tier === 'New Customer' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
                  'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                }`}>
                  {scoreResult.tier} Trust
                </span>
              </div>

              {/* Factors Breakdown */}
              <div className="space-y-1 text-[11px]">
                {scoreResult.positiveFactors.slice(0, 2).map((pf, i) => (
                  <p key={i} className="text-green-700 dark:text-green-400 font-semibold truncate">{pf}</p>
                ))}
                {scoreResult.negativeFactors.slice(0, 2).map((nf, i) => (
                  <p key={i} className="text-red-700 dark:text-red-400 font-semibold truncate">{nf}</p>
                ))}
              </div>
            </div>

            {/* Employment Intelligence */}
            <div className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/10 pb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-blue-500" /> Employment Intel
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[10px] text-gray-400 block font-semibold">Employer</span>
                  <p className="font-bold text-gray-900 dark:text-white">{employerName}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-gray-400 block font-semibold">Monthly Salary</span>
                    <p className="font-bold text-green-600">
                      {monthlySalary > 0 ? `MWK ${monthlySalary.toLocaleString()}` : 'Unspecified'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block font-semibold">Payroll Reliability</span>
                    <p className={`font-bold ${payrollReliabilityDisplay.includes('%') ? 'text-blue-600' : 'text-gray-400'}`}>
                      {payrollReliabilityDisplay}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Lifetime Value (LTV) */}
            <div className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/10 pb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-green-500" /> Customer Lifetime Value
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[10px] text-gray-400 block font-semibold">Generated Revenue</span>
                  <p className="text-xl font-black text-gray-900 dark:text-white">
                    MWK {ltvResult.ltv.toLocaleString()}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500">
                  <div>Total Borrowed: <strong>MWK {(ltvResult.totalBorrowed / 1000000).toFixed(1)}M</strong></div>
                  <div>Completed: <strong>{ltvResult.completedLoans} Loans</strong></div>
                </div>
              </div>
            </div>

          </div>

          {/* Section 2: Complete Loan History */}
          <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-white/10 flex items-center justify-between bg-gray-50 dark:bg-white/5">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-violet-600" />
                <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                  Complete Loan History ({custApps.length} Records)
                </h3>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-white/10 text-gray-400 font-bold uppercase text-[9px] tracking-wider">
                    <th className="p-3">Application ID</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Repayment %</th>
                    <th className="p-3">Interest Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {custApps.length > 0 ? (
                    custApps.map(app => {
                      const appReps = custReps.filter(r => r.applicationId === app.id);
                      const paidReps = appReps.filter(r => r.status === 'Paid');
                      const pctPaid = appReps.length > 0 ? Math.round((paidReps.length / appReps.length) * 100) : (app.status === 'Completed' ? 100 : 0);
                      const interestEarned = paidReps.reduce((s, r) => s + (r.interest || Math.round(r.amount * 0.15)), 0);

                      return (
                        <tr key={app.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                          <td className="p-3 font-mono font-bold text-gray-900 dark:text-white">{app.id}</td>
                          <td className="p-3 text-gray-500">{app.date}</td>
                          <td className="p-3 font-bold text-violet-600">MWK {app.amount.toLocaleString()}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              app.status === 'Completed' ? 'bg-green-50 text-green-700 border border-green-200' :
                              app.status === 'Disbursed' || app.status === 'Active' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {app.status}
                            </span>
                          </td>
                          <td className="p-3 font-bold">{pctPaid}%</td>
                          <td className="p-3 font-semibold text-green-600">MWK {interestEarned.toLocaleString()}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-gray-400 text-xs">
                        No previous loan application records found for this client.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Customer Risk Evolution Timeline */}
          <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-white/10 pb-3">
              <Activity className="w-4 h-4 text-purple-600" />
              <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                Customer Risk Evolution Timeline
              </h3>
            </div>

            <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100 dark:before:bg-white/10">
              {timelineEvents.map(evt => (
                <div key={evt.id} className="flex gap-4 relative pl-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 z-10 text-[10px] font-bold text-white shadow-sm ${
                    evt.riskLevel === 'Low' ? 'bg-green-500' :
                    evt.riskLevel === 'Medium' ? 'bg-amber-500' :
                    evt.riskLevel === 'New' ? 'bg-blue-500' : 'bg-red-500'
                  }`}>
                    {evt.riskLevel.charAt(0)}
                  </div>
                  <div className="flex-1 bg-gray-50 dark:bg-white/5 p-3 rounded-xl border border-gray-100 dark:border-white/10">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white">{evt.triggerEvent}</h4>
                      <span className="text-[10px] text-gray-400 font-mono">{evt.date}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                      {evt.details}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-gray-900 dark:bg-white dark:text-gray-900 text-white text-xs font-bold rounded-xl active:scale-95 transition-all shadow-sm"
          >
            Close Profile
          </button>
        </div>

      </div>
    </div>
  );
}
