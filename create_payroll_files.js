import fs from 'fs';
import path from 'path';

// Current month period
const CURRENT_MONTH = '2026-08';

const records = [
  { employee_id: 'EMP-001', customer_name: 'Jabulani Mayenda', employer: 'Ministry of Education', amount: 85000, month: CURRENT_MONTH, status: 'Active Loan (Disbursed)' },
  { employee_id: 'EMP-002', customer_name: 'Joel Phiri', employer: 'Ministry of Education', amount: 95000, month: CURRENT_MONTH, status: 'Active Loan (Disbursed)' },
  { employee_id: 'EMP-8842', customer_name: 'Samuel Chimwala', employer: 'Ministry of Agriculture', amount: 920000, month: CURRENT_MONTH, status: 'Active Loan (Disbursed)' },
  { employee_id: 'EMP-2940', customer_name: 'Bright Kamwendo', employer: 'ESCOM Malawi', amount: 769722, month: CURRENT_MONTH, status: 'Active Loan (In Progress)' },
  { employee_id: 'EMP-4492', customer_name: 'Blessings Kamau', employer: 'Ministry of Trade & Industry', amount: 378667, month: CURRENT_MONTH, status: 'Active Loan (Under Review)' },
  { employee_id: 'EMP-1022', customer_name: 'Mphatso Mwale', employer: 'Blantyre City Council', amount: 142000, month: CURRENT_MONTH, status: 'Pending Documents' },
  { employee_id: 'EMP-3482', customer_name: 'Kondwani Msiska', employer: 'Ministry of Transport & Public Works', amount: 1841667, month: CURRENT_MONTH, status: 'Active Loan (Approved)' },
  { employee_id: 'EMP-5001', customer_name: 'Chisomo Nyasulu', employer: 'Ministry of Agriculture', amount: 151250, month: CURRENT_MONTH, status: 'Active Loan (Disbursed)' },
  { employee_id: 'EMP-6120', customer_name: 'Thandiwe Chirwa', employer: 'Ministry of Education', amount: 407500, month: CURRENT_MONTH, status: 'Active Loan (Approved)' },
  { employee_id: 'EMP-7100', customer_name: 'Wisdom Zimba', employer: 'Malawi Police Service', amount: 100833, month: CURRENT_MONTH, status: 'Active Salary Advance' },
  { employee_id: 'EMP-0010', customer_name: 'Innocent Mvula', employer: 'Ministry of Transport & Public Works', amount: 1326000, month: CURRENT_MONTH, status: 'Active Loan (Under Review)' },
  { employee_id: 'EMP-0011', customer_name: 'Precious Lungu', employer: 'Ministry of Forestry & Natural Resources', amount: 284000, month: CURRENT_MONTH, status: 'Pending Documents' },
  { employee_id: 'EMP-0012', customer_name: 'Gift Tembo', employer: 'Malawi Telecommunications Ltd (MTL)', amount: 815000, month: CURRENT_MONTH, status: 'Active Loan (Approved)' },
  { employee_id: 'EMP-0013', customer_name: 'Stella Nkosi', employer: 'Ministry of Education', amount: 414167, month: CURRENT_MONTH, status: 'Active Loan (Disbursed)' },
  { employee_id: 'EMP-0014', customer_name: 'Memory Phiri', employer: 'Ministry of Tourism', amount: 1620667, month: CURRENT_MONTH, status: 'Active Loan (Approved)' },
  { employee_id: 'EMP-0018', customer_name: 'Faith Kabwila', employer: 'Ministry of Education', amount: 150000, month: CURRENT_MONTH, status: 'Active Loan' },
  { employee_id: 'EMP-0020', customer_name: 'Lusungu Dziko', employer: 'Ministry of Agriculture', amount: 220000, month: CURRENT_MONTH, status: 'Active Multiple Loans' },
  { employee_id: 'EMP-9999', customer_name: 'Unknown Test Employee', employer: 'Ministry of Education', amount: 85000, month: CURRENT_MONTH, status: 'Test Unmatched Record' },
];

// CSV Content formatted strictly according to PSA PayrollUpload standard
const csvHeader = 'employee_id,customer_name,employer,amount,month\n';
const csvRows = records.map(r => `${r.employee_id},"${r.customer_name}","${r.employer}",${r.amount},${r.month}`).join('\n');
const csvContent = csvHeader + csvRows;

const mainCsvPath = path.resolve('payroll_deductions_august_2026.csv');
fs.writeFileSync(mainCsvPath, csvContent, 'utf8');

// Also create single employer batch for Ministry of Education test
const eduRecords = records.filter(r => r.employer.includes('Education'));
const eduCsvRows = eduRecords.map(r => `${r.employee_id},"${r.customer_name}","${r.employer}",${r.amount},${r.month}`).join('\n');
const eduCsvContent = csvHeader + eduCsvRows;
const eduCsvPath = path.resolve('payroll_deductions_ministry_of_education.csv');
fs.writeFileSync(eduCsvPath, eduCsvContent, 'utf8');

console.log('✅ Updated CSV payroll files with Jabulani Mayenda and Joel Phiri:');
console.log('  1.', mainCsvPath);
console.log('  2.', eduCsvPath);
