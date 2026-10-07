import React, { useRef, useState, useMemo } from 'react';
import { X, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Users } from 'lucide-react';
import type { Customer } from '../types';
import { customersStore } from '../lib/store';

interface CustomerImportModalProps {
  onClose: () => void;
  onImported: (count: number) => void;
}

interface ParsedCustomer {
  name: string;
  nationalId: string;
  employer: string;
  phone: string;
  employeeNumber: string;
  sector: string;
  location: string;
  isDuplicate?: boolean;
}

const EXPECTED_HEADERS = ['name', 'national_id', 'employer', 'phone', 'employee_number', 'sector', 'location'];

function parseCSV(text: string): { rows: ParsedCustomer[]; errors: string[] } {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ['CSV file has no data rows.'] };

  const rawHeaders = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, ''));
  const missing = EXPECTED_HEADERS.filter(h => !rawHeaders.includes(h));
  if (missing.length) return { rows: [], errors: [`Missing required columns: ${missing.join(', ')}`] };

  const rows: ParsedCustomer[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => { obj[h] = cells[idx] ?? ''; });

    if (!obj.name || !obj.national_id) {
      errors.push(`Row ${i + 1}: Name and National ID are required.`);
      continue;
    }
    rows.push({
      name: obj.name,
      nationalId: obj.national_id,
      employer: obj.employer || '',
      phone: obj.phone || '',
      employeeNumber: obj.employee_number || '',
      sector: obj.sector || 'Public Sector',
      location: obj.location || 'Lilongwe',
    });
  }
  return { rows, errors };
}

export default function CustomerImportModal({ onClose, onImported }: CustomerImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<ParsedCustomer[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const existingCustomers = useMemo(() => customersStore.getAll(), []);

  const withDuplicates = useMemo(() => parsed.map(row => ({
    ...row,
    isDuplicate: existingCustomers.some(c =>
      c.name.toLowerCase().trim() === row.name.toLowerCase().trim() ||
      (c as any).nationalId === row.nationalId
    ),
  })), [parsed, existingCustomers]);

  const toImport = withDuplicates.filter(r => !r.isDuplicate);
  const duplicates = withDuplicates.filter(r => r.isDuplicate);

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setParseErrors(['Only CSV files are supported. Export your Excel sheet as CSV first.']);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const { rows, errors } = parseCSV(e.target?.result as string);
      setParsed(rows);
      setParseErrors(errors);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    const newCustomers: Customer[] = toImport.map((row, idx) => ({
      id: `cust-import-${Date.now()}-${idx}`,
      name: row.name,
      location: row.location,
      sector: row.sector,
      activeLoans: 0,
      status: 'Existing Customer',
      riskLevel: 'Low' as const,
      iconType: 'person' as const,
      phone: row.phone,
      employeeNumber: row.employeeNumber,
      customerType: 'Existing' as const,
      isActivated: false,
      dataSource: 'imported' as const,
      joinedAt: new Date().toISOString(),
    }));

    for (const c of newCustomers) {
      customersStore.add(c);
    }

    setImportedCount(newCustomers.length);
    setImporting(false);
    setDone(true);
    onImported(newCustomers.length);
  };

  if (done) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-on-surface">Import Complete</h2>
          <p className="text-sm text-secondary">
            <strong className="text-on-surface">{importedCount}</strong> customers imported successfully.
            {duplicates.length > 0 && ` ${duplicates.length} skipped (already exist).`}
          </p>
          <p className="text-xs text-secondary">Customers can now self-activate at <strong>/activate</strong> using their National ID, Employee Number and phone.</p>
          <button onClick={onClose} className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm transition-colors">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <div>
            <h2 className="text-base font-bold text-on-surface">Import Existing Customers</h2>
            <p className="text-xs text-secondary mt-0.5">Upload a CSV file with customer records from your existing portfolio.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-surface-container flex items-center justify-center">
            <X className="w-4 h-4 text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Format guide */}
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 rounded-xl p-4">
            <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Required CSV Columns
            </p>
            <p className="text-[11px] font-mono text-blue-600 dark:text-blue-400">
              name, national_id, employer, phone, employee_number, sector, location
            </p>
          </div>

          {/* Drop zone */}
          {!parsed.length && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                dragging ? 'border-orange-500 bg-orange-50' : 'border-outline-variant hover:border-orange-400 hover:bg-surface-container-low'
              }`}
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-secondary" />
              <p className="text-sm font-bold text-on-surface">Drop CSV file or click to browse</p>
              {fileName && <p className="text-xs text-orange-600 font-semibold mt-2">{fileName}</p>}
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
            </div>
          )}

          {parseErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-bold text-red-700 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Parse Errors</p>
              {parseErrors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
            </div>
          )}

          {/* Preview table */}
          {withDuplicates.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                    <CheckCircle className="w-3 h-3" /> {toImport.length} to import
                  </span>
                  {duplicates.length > 0 && (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                      <AlertCircle className="w-3 h-3" /> {duplicates.length} duplicate(s) — will be skipped
                    </span>
                  )}
                </div>
                <button onClick={() => { setParsed([]); setFileName(''); setParseErrors([]); }}
                  className="text-xs text-secondary hover:underline">Clear</button>
              </div>

              <div className="border border-outline-variant rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-surface-container">
                      <th className="p-3 font-bold text-secondary">Name</th>
                      <th className="p-3 font-bold text-secondary">National ID</th>
                      <th className="p-3 font-bold text-secondary">Employer</th>
                      <th className="p-3 font-bold text-secondary">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {withDuplicates.slice(0, 20).map((row, i) => (
                      <tr key={i} className={row.isDuplicate ? 'opacity-50 bg-amber-50/30' : ''}>
                        <td className="p-3 font-semibold text-on-surface">{row.name}</td>
                        <td className="p-3 font-mono text-secondary">{row.nationalId}</td>
                        <td className="p-3 text-secondary">{row.employer}</td>
                        <td className="p-3">
                          {row.isDuplicate
                            ? <span className="text-amber-600 font-bold text-[10px]">SKIP (duplicate)</span>
                            : <span className="text-green-600 font-bold text-[10px]">IMPORT</span>}
                        </td>
                      </tr>
                    ))}
                    {withDuplicates.length > 20 && (
                      <tr><td colSpan={4} className="p-3 text-center text-xs text-secondary">…and {withDuplicates.length - 20} more</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {parsed.length > 0 && (
          <div className="px-6 py-4 border-t border-outline-variant flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-secondary">
              <Users className="w-3.5 h-3.5" />
              {toImport.length} new customers will be added
            </div>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-4 py-2 rounded-xl border border-outline-variant text-xs font-bold text-secondary hover:bg-surface-container transition-colors">
                Cancel
              </button>
              <button
                disabled={importing || toImport.length === 0}
                onClick={handleImport}
                className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                {importing ? 'Importing…' : `Import ${toImport.length} Customers`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
