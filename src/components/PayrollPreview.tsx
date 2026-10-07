import React, { useMemo, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Loader2, ChevronRight, Users } from 'lucide-react';
import type { PayrollRecord, PayrollBatch, Customer, Repayment, AlertNotification } from '../types';
import { customersStore, repaymentsStore, payrollStore, alertsStore, applicationsStore } from '../lib/store';

interface PayrollPreviewProps {
  batch: PayrollBatch;
  records: PayrollRecord[];
  onApplied: () => void;
  onCancel: () => void;
}

function matchCustomer(record: PayrollRecord, customers: Customer[]): Customer | undefined {
  const name = record.customerName.toLowerCase().trim();
  return customers.find(c =>
    c.name.toLowerCase().trim() === name ||
    (c.employeeNumber && c.employeeNumber === record.employeeId)
  );
}

function formatMWK(n: number) {
  return 'K ' + n.toLocaleString('en-MW');
}

export default function PayrollPreview({ batch, records, onApplied, onCancel }: PayrollPreviewProps) {
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const customers = useMemo(() => customersStore.getAll(), []);

  const enriched = useMemo(() => records.map(rec => {
    const customer = matchCustomer(rec, customers);
    return { ...rec, customer, status: customer ? 'Matched' as const : 'Unmatched' as const, customerId: customer?.id };
  }), [records, customers]);

  const matched = enriched.filter(r => r.status === 'Matched');
  const unmatched = enriched.filter(r => r.status === 'Unmatched');
  const totalAmount = matched.reduce((s, r) => s + r.amount, 0);

  const handleApply = async () => {
    setApplying(true);
    setApplyError(null);

    const applied: PayrollRecord[] = [];
    const failed: PayrollRecord[] = [];

    // Pre-load all applications once for efficient lookup
    const allApplications = applicationsStore.getAllUnfiltered();

    for (const rec of enriched) {
      if (rec.status !== 'Matched' || !rec.customerId) {
        const failedRec: PayrollRecord = { ...rec, status: 'Unmatched' };
        failed.push(failedRec);

        // Notify customer if customer match exists
        if (rec.customer?.userId) {
          const alert: AlertNotification = {
            id: `alert-payroll-${Date.now()}-${rec.id}`,
            userId: rec.customer.userId,
            type: 'warning',
            title: 'Payroll Deduction Issue',
            description: `Your ${rec.month} payroll deduction was not processed. PINACO is reviewing the issue.`,
            date: new Date().toISOString(),
            isRead: false,
            actionLabel: 'View Repayments',
            actionRoute: '/client/loans',
          };
          alertsStore.add(alert);
        }
        continue;
      }

      // Find the customer's active/disbursed loan to link the repayment
      const activeApp = allApplications.find(
        a => a.userId === rec.customer?.userId &&
          (a.status === 'Disbursed' || a.status === 'Approved' || a.status === 'Active')
      );

      // Create a repayment record for this deduction
      // userId MUST match customer.userId so client portal and Customer360 can filter it
      const repaymentId = `rep-payroll-${rec.id}`;
      const repayment: Repayment = {
        id: repaymentId,
        userId: rec.customer!.userId || rec.customerId!,
        applicationId: activeApp?.id,          // ← links repayment to the active loan
        installmentNumber: 0,
        dueDate: rec.month + '-01',
        amount: rec.amount,
        status: 'Paid',
        paidAt: new Date().toISOString(),
      };

      try {
        repaymentsStore.upsert(repayment);
        applied.push({ ...rec, status: 'Applied', repaymentId });
      } catch {
        failed.push({ ...rec, status: 'Failed', failureReason: 'Could not create repayment record.' });
      }
    }

    // Save batch summary — throws if this fileName+month was already uploaded
    const finalBatch: PayrollBatch = {
      ...batch,
      matched: matched.length,
      applied: applied.length,
      failed: failed.length,
      status: failed.length === 0 ? 'Completed' : 'Partial',
    };

    try {
      payrollStore.addBatch(finalBatch);
    } catch (err: any) {
      // Duplicate batch detected — surface the error and abort
      const msg = String(err?.message || err).replace('DUPLICATE_BATCH: ', '');
      setApplyError(msg);
      setApplying(false);
      return;
    }

    payrollStore.addRecords([...applied, ...failed]);
    setApplying(false);
    setDone(true);
    onApplied();
  };

  if (done) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-on-surface">Payroll Batch Applied</h2>
        <p className="text-sm text-secondary">
          {matched.length} repayments recorded successfully. {unmatched.length > 0 && `${unmatched.length} records flagged for manual review.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Payroll Preview — {batch.month}</h2>
          <p className="text-sm text-secondary mt-0.5">{batch.fileName} &bull; {records.length} records</p>
        </div>
        <button onClick={onCancel} className="text-xs text-secondary hover:underline">← Upload Different File</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-green-700">{matched.length}</p>
          <p className="text-xs font-bold text-green-600 mt-1">Matched</p>
          <p className="text-[10px] text-secondary">{formatMWK(totalAmount)} total</p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-red-700">{unmatched.length}</p>
          <p className="text-xs font-bold text-red-600 mt-1">Unmatched</p>
          <p className="text-[10px] text-secondary">Requires manual review</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-blue-700">{records.length}</p>
          <p className="text-xs font-bold text-blue-600 mt-1">Total Records</p>
          <p className="text-[10px] text-secondary">{batch.fileName}</p>
        </div>
      </div>

      {/* Record table */}
      <div className="border border-outline-variant rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-surface-container">
                <th className="p-3 font-bold text-secondary uppercase tracking-wider">Employee</th>
                <th className="p-3 font-bold text-secondary uppercase tracking-wider">Employer</th>
                <th className="p-3 font-bold text-secondary uppercase tracking-wider">Amount</th>
                <th className="p-3 font-bold text-secondary uppercase tracking-wider">Customer Match</th>
                <th className="p-3 font-bold text-secondary uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {enriched.map(rec => (
                <tr key={rec.id} className={`transition-colors ${rec.status === 'Unmatched' ? 'bg-red-50/40 dark:bg-red-950/10' : 'hover:bg-surface-container-low'}`}>
                  <td className="p-3">
                    <p className="font-semibold text-on-surface">{rec.customerName}</p>
                    <p className="text-[10px] text-secondary font-mono">{rec.employeeId}</p>
                  </td>
                  <td className="p-3 text-secondary">{rec.employer}</td>
                  <td className="p-3 font-bold text-primary">{formatMWK(rec.amount)}</td>
                  <td className="p-3">
                    {rec.customer ? (
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3 h-3 text-green-600" />
                        <span className="text-on-surface font-semibold">{rec.customer.name}</span>
                      </div>
                    ) : (
                      <span className="text-red-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> No match found
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {rec.status === 'Matched' ? (
                      <span className="flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
                        <CheckCircle className="w-3 h-3" /> Matched
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
                        <XCircle className="w-3 h-3" /> Unmatched
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {unmatched.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 dark:text-amber-300 font-semibold">
          ⚠️ {unmatched.length} unmatched record(s) will be saved as <strong>FAILED_DEDUCTION</strong> exceptions for manual officer review. No overdue penalty will be applied.
        </div>
      )}

      {/* Duplicate batch error banner */}
      {applyError && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-300 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">Duplicate Upload Blocked</p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">{applyError}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 justify-end pt-2">
        <button onClick={onCancel} className="px-6 py-2.5 rounded-xl border border-outline-variant text-sm font-bold text-secondary hover:bg-surface-container transition-colors">
          Cancel
        </button>
        <button
          disabled={applying || records.length === 0}
          onClick={handleApply}
          className="px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-60"
        >
          {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          {applying ? 'Applying...' : `Apply ${matched.length} Deductions`}
        </button>
      </div>
    </div>
  );
}

