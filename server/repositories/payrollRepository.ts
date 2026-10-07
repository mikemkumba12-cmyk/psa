import type { PayrollBatch, PayrollRecord } from '../../src/types';

let payrollBatchesStore: PayrollBatch[] = [
  {
    id: 'batch-2024-07-edu',
    month: '2024-07',
    uploadedBy: 'system-seed',
    fileName: 'ministry-education-2024-07.csv',
    totalRecords: 120,
    matched: 118,
    applied: 118,
    failed: 2,
    status: 'Partial',
    uploadedAt: '2024-07-25',
  },
  {
    id: 'batch-2024-07-pol',
    month: '2024-07',
    uploadedBy: 'system-seed',
    fileName: 'malawi-police-2024-07.csv',
    totalRecords: 85,
    matched: 83,
    applied: 83,
    failed: 2,
    status: 'Partial',
    uploadedAt: '2024-07-26',
  },
];

let payrollRecordsStore: PayrollRecord[] = [
  {
    id: 'pr-101',
    batchId: 'batch-2024-07-edu',
    employeeId: 'EMP-001',
    customerName: 'Jabulani Mayenda',
    customerId: 'cust-001',
    employer: 'Ministry of Education',
    amount: 85000,
    month: '2024-07',
    status: 'Matched',
  },
  {
    id: 'pr-102',
    batchId: 'batch-2024-07-edu',
    employeeId: 'EMP-002',
    customerName: 'Mercy Phiri',
    employer: 'Ministry of Education',
    amount: 92000,
    month: '2024-07',
    status: 'Unmatched',
    failureReason: 'Employee number did not match an active customer record.',
  },
];

export const payrollRepository = {
  async findAllBatches(): Promise<PayrollBatch[]> {
    return payrollBatchesStore;
  },

  async findAllRecords(): Promise<PayrollRecord[]> {
    return payrollRecordsStore;
  },

  async findRecordsByEmployer(employerName: string): Promise<PayrollRecord[]> {
    return payrollRecordsStore.filter(r => r.employer.toLowerCase() === employerName.toLowerCase());
  },

  async saveBatch(batch: PayrollBatch, records: PayrollRecord[]): Promise<void> {
    payrollBatchesStore = [batch, ...payrollBatchesStore];
    payrollRecordsStore = [...records, ...payrollRecordsStore];
  },
};
