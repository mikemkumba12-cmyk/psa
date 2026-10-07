import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, X } from 'lucide-react';
import type { PayrollRecord, PayrollBatch } from '../types';

interface ParsedRow {
  employee_id: string;
  customer_name: string;
  employer: string;
  amount: number;
  month: string;
}

interface PayrollUploadProps {
  onBatchReady: (batch: PayrollBatch, records: PayrollRecord[]) => void;
}

const EXPECTED_HEADERS = ['employee_id', 'customer_name', 'employer', 'amount', 'month'];

function parseCSV(text: string): { rows: ParsedRow[]; errors: string[] } {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ['CSV has no data rows.'] };

  const rawHeaders = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const missing = EXPECTED_HEADERS.filter(h => !rawHeaders.includes(h));
  if (missing.length) {
    return { rows: [], errors: [`Missing columns: ${missing.join(', ')}. Required: ${EXPECTED_HEADERS.join(', ')}`] };
  }

  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => { obj[h] = cells[idx] ?? ''; });

    const amount = parseFloat(obj.amount);
    if (!obj.employee_id || !obj.customer_name || !obj.month) {
      errors.push(`Row ${i + 1}: Missing required fields.`);
      continue;
    }
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Row ${i + 1}: Invalid amount "${obj.amount}".`);
      continue;
    }
    rows.push({
      employee_id: obj.employee_id,
      customer_name: obj.customer_name,
      employer: obj.employer,
      amount,
      month: obj.month,
    });
  }

  return { rows, errors };
}

export default function PayrollUpload({ onBatchReady }: PayrollUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setParseErrors(['Only CSV files are supported. Please export your Excel file as CSV.']);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { rows, errors } = parseCSV(text);
      setParseErrors(errors);
      if (rows.length === 0 && errors.length > 0) return;

      // Detect month from first row
      const month = rows[0]?.month || new Date().toISOString().slice(0, 7);
      const batchId = `batch-${Date.now()}`;

      const records: PayrollRecord[] = rows.map((row, idx) => ({
        id: `pr-${batchId}-${idx}`,
        batchId,
        employeeId: row.employee_id,
        customerName: row.customer_name,
        employer: row.employer,
        amount: row.amount,
        month: row.month,
        status: 'Matched', // Will be resolved in preview
      }));

      const batch: PayrollBatch = {
        id: batchId,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'staff',
        fileName: file.name,
        totalRecords: records.length,
        matched: 0,
        applied: 0,
        failed: 0,
        month,
        status: 'Processing',
      };

      onBatchReady(batch, records);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Payroll Deduction Upload</h1>
        <p className="text-sm text-secondary mt-1">Upload monthly payroll deduction file to process repayments.</p>
      </div>

      {/* Format guide */}
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileSpreadsheet className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-bold text-blue-800 dark:text-blue-300">Expected CSV Format</span>
        </div>
        <div className="overflow-x-auto">
          <table className="text-[11px] font-mono w-full">
            <thead>
              <tr className="text-blue-700 dark:text-blue-400 font-bold">
                {EXPECTED_HEADERS.map(h => <th key={h} className="text-left pr-6 pb-1">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="text-blue-600 dark:text-blue-500">
                <td className="pr-6">EMP-001</td>
                <td className="pr-6">Jabulani Mayenda</td>
                <td className="pr-6">Ministry of Education</td>
                <td className="pr-6">85000</td>
                <td className="pr-6">2024-07</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
          dragging ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/10' : 'border-outline-variant hover:border-orange-400 hover:bg-surface-container-low'
        }`}
      >
        <Upload className={`w-10 h-10 mx-auto mb-3 ${dragging ? 'text-orange-500' : 'text-secondary'}`} />
        <p className="text-sm font-bold text-on-surface">Drop CSV file here, or click to browse</p>
        <p className="text-xs text-secondary mt-1">Supports .csv files (export from Excel or Google Sheets)</p>
        {fileName && (
          <p className="text-xs font-semibold text-orange-600 mt-3 flex items-center justify-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" /> {fileName} loaded
          </p>
        )}
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
      </div>

      {parseErrors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl p-4 space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-bold text-red-700 dark:text-red-300">File Errors</span>
          </div>
          {parseErrors.map((err, i) => <p key={i} className="text-xs text-red-600">{err}</p>)}
        </div>
      )}
    </div>
  );
}
