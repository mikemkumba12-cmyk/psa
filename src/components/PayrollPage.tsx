import React, { useState } from 'react';
import PayrollUpload from './PayrollUpload';
import PayrollPreview from './PayrollPreview';
import PayrollHistory from './PayrollHistory';
import type { PayrollBatch, PayrollRecord } from '../types';
import { Upload, History } from 'lucide-react';

type Tab = 'upload' | 'history';

export default function PayrollPage() {
  const [tab, setTab] = useState<Tab>('upload');
  const [pendingBatch, setPendingBatch] = useState<PayrollBatch | null>(null);
  const [pendingRecords, setPendingRecords] = useState<PayrollRecord[]>([]);

  const handleBatchReady = (batch: PayrollBatch, records: PayrollRecord[]) => {
    setPendingBatch(batch);
    setPendingRecords(records);
  };

  const handleApplied = () => {
    setPendingBatch(null);
    setPendingRecords([]);
    setTab('history');
  };

  const handleCancel = () => {
    setPendingBatch(null);
    setPendingRecords([]);
  };

  // Show preview if batch is ready
  if (pendingBatch) {
    return (
      <div className="space-y-0">
        <PayrollPreview
          batch={pendingBatch}
          records={pendingRecords}
          onApplied={handleApplied}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex items-center gap-2 bg-surface-container-low rounded-2xl p-1.5 w-fit">
        <button
          onClick={() => setTab('upload')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
            tab === 'upload' ? 'bg-white dark:bg-[#1a1a1a] text-orange-600 shadow-sm' : 'text-secondary hover:text-on-surface'
          }`}
        >
          <Upload className="w-3.5 h-3.5" /> Upload Payroll
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
            tab === 'history' ? 'bg-white dark:bg-[#1a1a1a] text-orange-600 shadow-sm' : 'text-secondary hover:text-on-surface'
          }`}
        >
          <History className="w-3.5 h-3.5" /> Batch History
        </button>
      </div>

      {tab === 'upload' ? (
        <PayrollUpload onBatchReady={handleBatchReady} />
      ) : (
        <PayrollHistory />
      )}
    </div>
  );
}
