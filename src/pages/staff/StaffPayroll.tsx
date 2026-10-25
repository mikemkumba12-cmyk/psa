import React, { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { date, money, titleCase } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button } from '../../ui/Button';
import { Alert, Badge, StatusBadge } from '../../ui/Feedback';
import { DataTable } from '../../ui/DataTable';
import { FormGrid, TextInput } from '../../ui/Form';
import { Card, PageHeader } from '../../ui/Layout';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

interface Batch { id: string; month: string; employer: string; fileName: string; uploadedBy: string | null; uploadedAt: string; totalRecords: number; matched: number; unmatched: number; totalAmount: number; status: string }

/** Reads employeeNumber, employeeName and amount columns from an employer deduction CSV. */
function parseDeductions(text: string): Array<{ employeeNumber: string; employeeName: string; amount: string }> {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(item => item.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const find = (...names: string[]) => header.findIndex(item => names.includes(item));
  const number = find('employeenumber', 'employeeid', 'empno', 'employeeno');
  const name = find('employeename', 'customername', 'name', 'fullname');
  const amount = find('amount', 'deduction', 'deductionamount');
  if (number < 0 || amount < 0) throw new Error('The file needs "employeeNumber" and "amount" columns.');
  return lines.slice(1).map(line => {
    const cells = line.split(',').map(item => item.trim().replace(/^"|"$/g, ''));
    return { employeeNumber: cells[number] ?? '', employeeName: name >= 0 ? cells[name] ?? '' : '', amount: (cells[amount] ?? '').replace(/[^\d.]/g, '') };
  });
}

export function StaffPayroll() {
  const toast = useToast();
  const batches = useResource<Batch[]>('/api/payroll/batches');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Payroll deductions" description="Match employer deduction files to active payroll loans. Matched rows become repayments that a second person confirms."
        actions={<Button onClick={() => setUploadOpen(true)}>Upload deduction file</Button>} />
      <Card padded={false}>
        <DataTable caption="Payroll batches" rows={batches.data} loading={batches.loading} error={batches.error} onRetry={batches.reload} rowKey={row => row.id}
          onRowClick={row => setDetail(row.id)} empty={{ title: 'No deduction files uploaded yet' }}
          columns={[
            { key: 'employer', header: 'Employer', mobile: 'title', render: row => <>{row.employer}<span className="block text-xs text-ink-muted">{row.fileName}</span></> },
            { key: 'month', header: 'Month', render: row => row.month },
            { key: 'records', header: 'Rows', align: 'right', render: row => row.totalRecords },
            { key: 'matched', header: 'Matched', align: 'right', render: row => `${row.matched} / ${row.totalRecords}` },
            { key: 'amount', header: 'Total', align: 'right', render: row => money(row.totalAmount) },
            { key: 'uploaded', header: 'Uploaded', render: row => `${date(row.uploadedAt)}${row.uploadedBy ? ` by ${row.uploadedBy}` : ''}` },
          ]} />
      </Card>
      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onDone={id => { setUploadOpen(false); toast('File processed.'); void batches.reload(); setDetail(id); }} />}
      {detail && <BatchDetail id={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [employer, setEmployer] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [valueDate, setValueDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ReturnType<typeof parseDeductions>>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const choose = async (chosen?: File) => {
    setError(null);
    setFile(chosen ?? null);
    if (!chosen) return;
    try { setRows(parseDeductions(await chosen.text())); } catch (caught: any) { setRows([]); setError(caught.message); }
  };
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ batchId: string }>('/api/payroll/batches', { body: { fileName: file!.name, employer, month, valueDate, rows } });
      onDone(result.batchId);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Upload failed.');
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Upload deduction file" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={!rows.length || !employer}>Process {rows.length || ''} rows</Button></>}>
      <div className="space-y-4">
        <FormGrid>
          <TextInput label="Employer" required value={employer} onChange={event => setEmployer(event.target.value)} />
          <TextInput label="Payroll month" type="month" required value={month} onChange={event => setMonth(event.target.value)} />
          <TextInput label="Date funds were received" type="date" required value={valueDate} onChange={event => setValueDate(event.target.value)} />
        </FormGrid>
        <div>
          <label htmlFor="payroll-file" className="mb-1.5 block text-sm font-medium">CSV file</label>
          <input id="payroll-file" type="file" accept=".csv,text/csv" onChange={event => choose(event.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-800" />
          <p className="mt-1.5 text-xs text-ink-muted">Columns: employeeNumber, employeeName (optional), amount.</p>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        {rows.length > 0 && <Alert tone="info">{rows.length} rows read. Nothing changes until matched repayments are confirmed on the Transactions page.</Alert>}
      </div>
    </Modal>
  );
}

function BatchDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useResource<{ employer: string; month: string; records: Array<{ id: string; employeeNumber: string; employeeName: string; amount: number; status: string; reason: string | null; applicationReference: string | null; transactionStatus: string | null }> }>(`/api/payroll/batches/${id}`);
  return (
    <Modal open onClose={onClose} title={data ? `${data.employer} — ${data.month}` : 'Batch'} size="xl">
      <DataTable caption="Deduction rows" rows={data?.records} loading={!data} rowKey={row => row.id}
        columns={[
          { key: 'employee', header: 'Employee', mobile: 'title', render: row => `${row.employeeName || '—'} (${row.employeeNumber})` },
          { key: 'amount', header: 'Amount', align: 'right', render: row => money(row.amount) },
          { key: 'match', header: 'Result', render: row => <Badge tone={row.status === 'matched' ? 'success' : row.status === 'needs_review' ? 'warning' : 'danger'}>{titleCase(row.status)}</Badge> },
          { key: 'loan', header: 'Loan', render: row => row.applicationReference ?? row.reason ?? '—' },
          { key: 'txn', header: 'Repayment', render: row => row.transactionStatus ? <StatusBadge status={row.transactionStatus} /> : '—' },
        ]} />
    </Modal>
  );
}
