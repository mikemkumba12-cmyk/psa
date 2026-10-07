import React, { useMemo } from 'react';
import { History, CheckCircle, AlertTriangle, XCircle, FileSpreadsheet, Calendar } from 'lucide-react';
import { payrollStore } from '../lib/store';
import type { PayrollBatch } from '../types';

function formatMWK(n: number) { return 'K ' + n.toLocaleString('en-MW'); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

export default function PayrollHistory() {
  const batches = useMemo(() => payrollStore.getAllBatches(), []);
  const records = useMemo(() => payrollStore.getAllRecords(), []);

  const statusStyle = (s: PayrollBatch['status']) => {
    if (s === 'Completed') return 'bg-green-50 text-green-700 border border-green-200';
    if (s === 'Partial') return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-blue-50 text-blue-700 border border-blue-200';
  };

  const statusIcon = (s: PayrollBatch['status']) => {
    if (s === 'Completed') return <CheckCircle className="w-3.5 h-3.5" />;
    if (s === 'Partial') return <AlertTriangle className="w-3.5 h-3.5" />;
    return null;
  };

  if (batches.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Payroll History</h1>
          <p className="text-sm text-secondary mt-1">Previous deduction batches and their results.</p>
        </div>
        <div className="text-center py-16 space-y-3 border border-dashed border-outline-variant rounded-2xl">
          <History className="w-10 h-10 text-secondary mx-auto" />
          <p className="text-sm font-bold text-secondary">No payroll batches yet.</p>
          <p className="text-xs text-secondary">Upload your first payroll CSV to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Payroll History</h1>
        <p className="text-sm text-secondary mt-1">{batches.length} batch{batches.length !== 1 ? 'es' : ''} processed.</p>
      </div>

      <div className="space-y-4">
        {batches.map(batch => {
          const batchRecords = records.filter(r => r.batchId === batch.id);
          const totalAmount = batchRecords.filter(r => r.status === 'Applied').reduce((s, r) => s + r.amount, 0);
          const failedRecords = batchRecords.filter(r => r.status === 'Unmatched' || r.status === 'Failed');

          return (
            <div key={batch.id} className="bg-white dark:bg-[#1a1a1a] border border-outline-variant rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-100 dark:bg-orange-950/30 rounded-xl flex items-center justify-center">
                    <FileSpreadsheet className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-bold text-on-surface text-sm">{batch.fileName}</p>
                    <p className="text-[10px] text-secondary flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      Month: {batch.month} &bull; Uploaded {fmtDate(batch.uploadedAt)}
                    </p>
                  </div>
                </div>
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${statusStyle(batch.status)}`}>
                  {statusIcon(batch.status)} {batch.status}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-3 bg-surface-container-low rounded-xl">
                  <p className="text-xl font-black text-on-surface">{batch.totalRecords}</p>
                  <p className="text-[10px] text-secondary font-bold mt-0.5">Total Records</p>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-xl">
                  <p className="text-xl font-black text-green-700">{batch.applied}</p>
                  <p className="text-[10px] text-green-600 font-bold mt-0.5">Applied</p>
                </div>
                <div className={`text-center p-3 rounded-xl ${batch.failed > 0 ? 'bg-red-50 dark:bg-red-950/20' : 'bg-surface-container-low'}`}>
                  <p className={`text-xl font-black ${batch.failed > 0 ? 'text-red-700' : 'text-secondary'}`}>{batch.failed}</p>
                  <p className={`text-[10px] font-bold mt-0.5 ${batch.failed > 0 ? 'text-red-600' : 'text-secondary'}`}>Failed</p>
                </div>
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-xl">
                  <p className="text-xl font-black text-blue-700">{formatMWK(totalAmount)}</p>
                  <p className="text-[10px] text-blue-600 font-bold mt-0.5">Total Applied</p>
                </div>
              </div>

              {failedRecords.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer text-xs font-bold text-red-600 flex items-center gap-1.5 list-none">
                    <XCircle className="w-3.5 h-3.5" />
                    {failedRecords.length} exception(s) require review
                    <span className="ml-auto text-[10px] text-secondary group-open:hidden">(click to expand)</span>
                  </summary>
                  <div className="mt-3 space-y-2">
                    {failedRecords.map(rec => (
                      <div key={rec.id} className="flex items-center justify-between bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl px-3 py-2">
                        <div>
                          <p className="text-xs font-bold text-on-surface">{rec.customerName}</p>
                          <p className="text-[10px] text-secondary">{rec.employeeId} &bull; {rec.employer}</p>
                          {rec.failureReason && <p className="text-[10px] text-red-600 mt-0.5">{rec.failureReason}</p>}
                        </div>
                        <p className="text-sm font-bold text-red-600">{formatMWK(rec.amount)}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
