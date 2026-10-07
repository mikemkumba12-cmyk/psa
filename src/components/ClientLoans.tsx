import React from 'react';
import { FileText, Download, CheckCircle, Clock, ChevronRight, Edit3, ShieldAlert, Award, PlusCircle } from 'lucide-react';
import { LoanApplication, Repayment } from '../types';

interface ClientLoansProps {
  applications: LoanApplication[];
  repayments: Repayment[];
  onPayInstallment: (repaymentId: string) => void;
  onRequestFinancing: () => void;
}

export default function ClientLoans({ 
  applications, 
  repayments, 
  onPayInstallment, 
  onRequestFinancing 
}: ClientLoansProps) {
  // Find primary active loan application
  const activeApp = applications.find(app => app.status === 'Disbursed' || app.status === 'Approved' || app.status === 'Under Review') || applications[0];

  if (!activeApp) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">My Loans</h1>
          <p className="text-sm text-secondary">Monitor your loan applications and schedule</p>
        </div>

        <div className="bg-white border border-outline-variant rounded-2xl p-8 text-center shadow-sm space-y-4">
          <div className="w-14 h-14 bg-orange-100 dark:bg-orange-500/20 text-orange-500 rounded-full flex items-center justify-center mx-auto">
            <FileText className="w-7 h-7" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-base font-bold text-on-surface">No Active Loans Found</h3>
            <p className="text-xs text-secondary leading-relaxed">
              You haven't submitted any loan requests yet. Use our financing calculator to estimate your rate and submit an application.
            </p>
          </div>
          <button
            onClick={onRequestFinancing}
            className="bg-primary-container text-white px-6 py-3 rounded-2xl text-xs font-bold shadow-md hover:brightness-95 active:scale-95 transition-all inline-flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" /> Apply for Loan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface">My Loans</h1>
        <p className="text-sm text-secondary">Monitor your loan applications and schedule</p>
      </div>

      {/* Loan Application Progress Card */}
      <section className="bg-white border border-outline-variant rounded-2xl p-5 shadow-sm">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Active Application</h2>
            <p className="text-[11px] font-mono text-secondary">ID: #{activeApp.id}</p>
          </div>
          <span className={`text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
            activeApp.status === 'Approved' || activeApp.status === 'Disbursed'
              ? 'bg-green-600 text-white'
              : activeApp.status === 'Decline'
              ? 'bg-red-600 text-white'
              : 'bg-primary-container text-white'
          }`}>
            {activeApp.status}
          </span>
        </div>

        {/* Dynamic Progress Timeline */}
        <div className="relative py-4">
          {/* Progress Connecting Line */}
          <div className="absolute top-9 left-6 right-6 h-0.5 bg-surface-container-high"></div>
          <div 
            className="absolute top-9 left-6 h-0.5 bg-primary-container transition-all duration-500" 
            style={{ 
              width: activeApp.status === 'Disbursed' ? '100%' :
                     activeApp.status === 'Approved' ? '75%' : 
                     activeApp.status === 'Under Review' ? '50%' : 
                     activeApp.status === 'In Progress' ? '25%' : '0%' 
            }}
          ></div>

          <div className="relative flex justify-between">
            {/* Step 1: Application */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-10 h-10 rounded-full bg-primary-container text-white flex items-center justify-center z-10 border-4 border-white shadow-sm">
                <Edit3 className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-primary">Application</span>
            </div>

            {/* Step 2: Verification */}
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 border-4 border-white shadow-sm ${
                activeApp.status !== 'In Progress' ? 'bg-primary-container text-white' : 'bg-surface-container-high text-secondary'
              }`}>
                <Award className="w-4 h-4" />
              </div>
              <span className={`text-[11px] font-semibold ${
                activeApp.status !== 'In Progress' ? 'text-primary' : 'text-secondary'
              }`}>Verification</span>
            </div>

            {/* Step 3: Approval */}
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 border-4 border-white shadow-sm ${
                activeApp.status === 'Approved' || activeApp.status === 'Disbursed' ? 'bg-primary-container text-white' : 'bg-surface-container-high text-secondary'
              }`}>
                <CheckCircle className="w-4 h-4" />
              </div>
              <span className={`text-[11px] font-semibold ${
                activeApp.status === 'Approved' || activeApp.status === 'Disbursed' ? 'text-on-surface font-bold' : 'text-secondary'
              }`}>Approval</span>
            </div>

            {/* Step 4: Disbursement */}
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 border-4 border-white shadow-sm ${
                activeApp.status === 'Disbursed' ? 'bg-green-600 text-white' : 'bg-surface-container-high text-secondary'
              }`}>
                <Clock className="w-4 h-4" />
              </div>
              <span className={`text-[11px] font-semibold ${
                activeApp.status === 'Disbursed' ? 'text-green-600 font-bold' : 'text-secondary'
              }`}>Disbursement</span>
            </div>
          </div>
        </div>

        {/* Status explanation Box */}
        <div className="mt-4 bg-surface-container-low rounded-xl p-4 border border-outline-variant/30 flex items-start gap-3">
          <Clock className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-xs text-on-surface leading-relaxed">
            <span className="font-bold text-primary">Application Status: </span>
            {activeApp.status === 'Under Review' && 'Your application & ID documents are currently under risk assessment by a Pinnacle Loan Officer.'}
            {activeApp.status === 'Approved' && 'Congratulations! Your loan has been approved by Pinnacle credit committee. Disbursement in progress.'}
            {activeApp.status === 'Disbursed' && 'Your loan has been disbursed. Monthly repayments will be automatically processed via payroll deduction.'}
            {activeApp.status === 'Decline' && 'Your application was declined following risk evaluation. Contact your officer for details.'}
          </div>
        </div>
      </section>

      {/* Repayment History Section with Payroll Explanation */}
      <section className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-on-surface">Payroll Repayment Schedule</h2>
          <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 px-2.5 py-1 rounded-lg">
            Automated Payroll Deduction
          </span>
        </div>

        <div className="bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-start gap-3">
          <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
            <strong>Payroll Integrated:</strong> Installments are automatically deducted from your employer payroll on your monthly pay date. Pinnacle officers record deductions upon payroll reconciliation.
          </p>
        </div>

        <div className="bg-white border border-outline-variant rounded-2xl overflow-hidden shadow-sm divide-y divide-surface-container">
          {repayments.length > 0 ? (
            repayments.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center">
                    <FileText className="text-tertiary w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">Installment #{item.installmentNumber}</p>
                    <p className="text-[11px] text-secondary">{item.dueDate} • Payroll Deduction</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold text-primary">K {item.amount.toLocaleString()}.00</p>
                  {item.status === 'Upcoming' || item.status === 'Scheduled' || item.status === 'Overdue' ? (
                    <button 
                      onClick={() => onPayInstallment(item.id)}
                      className="bg-primary-container text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:brightness-95"
                    >
                      Record Payroll Sync
                    </button>
                  ) : (
                    <span className="bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                      Deducted & Paid
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-xs text-secondary">
              No repayment schedule generated yet. Repayments appear once your loan is approved & disbursed.
            </div>
          )}
        </div>
      </section>

      {/* Loan Documents Section */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-on-surface">Loan Documents</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Document 1 */}
          <div className="bg-white border border-outline-variant rounded-2xl p-4 flex flex-col gap-3 items-center text-center shadow-sm">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <FileText className="text-primary w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-on-surface leading-tight">Loan Agreement</p>
              <p className="text-[10px] text-secondary">PDF • Digital Record</p>
            </div>
            <button 
              onClick={() => alert("Downloading Loan Agreement PDF...")}
              className="w-full py-2 bg-surface-container-low text-primary font-bold text-xs rounded-xl border border-outline-variant/30 hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          </div>

          {/* Document 2 */}
          <div className="bg-white border border-outline-variant rounded-2xl p-4 flex flex-col gap-3 items-center text-center shadow-sm">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <CheckCircle className="text-primary w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-on-surface leading-tight">Payroll Deduction Mandate</p>
              <p className="text-[10px] text-secondary">PDF • Verified</p>
            </div>
            <button 
              onClick={() => alert("Downloading Payroll Deduction Mandate...")}
              className="w-full py-2 bg-surface-container-low text-primary font-bold text-xs rounded-xl border border-outline-variant/30 hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          </div>
        </div>
      </section>

      {/* Floating CTA Section */}
      <div className="pt-6 pb-2">
        <button 
          onClick={onRequestFinancing}
          className="bg-primary-container text-white font-semibold py-4 px-6 rounded-2xl shadow-lg flex items-center justify-center gap-2 hover:brightness-105 active:scale-95 transition-all w-full"
        >
          <PlusCircle className="w-5 h-5" />
          Request Additional Financing
        </button>
      </div>
    </div>
  );
}
