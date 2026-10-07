/**
 * Pinnacle Smart Advisor — Customer Mock Data
 *
 * Production replacement point:
 *   Replace with GET /api/customers in src/services/customerService.ts
 */

import type { Customer, Branch, LoanOfficer, LoanProduct } from '../types';

export const seedCustomers: Customer[] = [
  { id: 'cust-001', userId: 'demo-customer-01', name: 'Samuel Chimwala', location: 'Lilongwe', sector: 'Agriculture', activeLoans: 1, status: 'Active', riskLevel: 'Medium', iconType: 'storefront', phone: '+265 888 123 456', email: 's.chimwala@pmail.mw', joinedAt: '2022-03-15', employeeNumber: 'EMP-8842', nationalId: 'NID-9921-8842' },
  { id: 'cust-002', userId: 'demo-customer-02', name: 'Bright Kamwendo', location: 'Lilongwe', sector: 'Sustainable Energy', activeLoans: 1, status: 'Active', riskLevel: 'Low', iconType: 'business', phone: '+265 999 765 432', email: 'b.kamwendo@pmail.mw', joinedAt: '2021-07-20', employeeNumber: 'EMP-2940', nationalId: 'NID-9921-2940' },
  { id: 'cust-003', userId: 'demo-customer-03', name: 'Blessings Kamau', location: 'Blantyre', sector: 'Retail', activeLoans: 1, status: 'Active', riskLevel: 'Medium', iconType: 'storefront', phone: '+265 881 345 678', email: 'b.kamau@pmail.mw', joinedAt: '2020-11-08', employeeNumber: 'EMP-4492', nationalId: 'NID-9921-4492' },
  { id: 'cust-004', userId: 'demo-customer-04', name: 'Mphatso Mwale', location: 'Blantyre', sector: 'Retail', activeLoans: 1, status: 'Pending', riskLevel: 'High', iconType: 'warning', phone: '+265 881 223 344', email: 'm.mwale@pmail.mw', joinedAt: '2022-09-01', employeeNumber: 'EMP-1022', nationalId: 'NID-9921-1022' },
  { id: 'cust-005', userId: 'demo-customer-05', name: 'Kondwani Msiska', location: 'Lilongwe', sector: 'Construction', activeLoans: 1, status: 'Active', riskLevel: 'Low', iconType: 'business', phone: '+265 991 334 556', email: 'k.msiska@pmail.mw', joinedAt: '2016-04-12', employeeNumber: 'EMP-3482', nationalId: 'NID-9921-3482' },
  { id: 'cust-006', userId: 'demo-customer-06', name: 'Chisomo Nyasulu', location: 'Mzuzu', sector: 'Agriculture', activeLoans: 1, status: 'Active', riskLevel: 'Medium', iconType: 'storefront', phone: '+265 888 901 234', email: 'c.nyasulu@pmail.mw', joinedAt: '2021-01-25', employeeNumber: 'EMP-5001', nationalId: 'NID-9921-5001' },
  { id: 'cust-007', userId: 'demo-customer-07', name: 'Thandiwe Chirwa', location: 'Blantyre', sector: 'Retail', activeLoans: 1, status: 'Active', riskLevel: 'Low', iconType: 'storefront', phone: '+265 881 445 667', email: 't.chirwa@pmail.mw', joinedAt: '2019-08-17', employeeNumber: 'EMP-6120', nationalId: 'NID-9921-6120' },
  { id: 'cust-008', userId: 'demo-customer-08', name: 'Wisdom Zimba', location: 'Lilongwe', sector: 'Personal', activeLoans: 1, status: 'Active', riskLevel: 'Medium', iconType: 'person', phone: '+265 999 112 334', email: 'w.zimba@pmail.mw', joinedAt: '2023-01-10', employeeNumber: 'EMP-7100', nationalId: 'NID-9921-7100' },
  { id: 'cust-009', userId: 'demo-customer-09', name: 'Mercy Gondwe', location: 'Zomba', sector: 'Healthcare', activeLoans: 0, status: 'Active', riskLevel: 'Low', iconType: 'business', phone: '+265 881 778 990', email: 'm.gondwe@pmail.mw', joinedAt: '2015-06-03', employeeNumber: 'EMP-0009', nationalId: 'NID-9921-0009' },
  { id: 'cust-010', userId: 'demo-customer-10', name: 'Innocent Mvula', location: 'Kasungu', sector: 'Transport', activeLoans: 1, status: 'Active', riskLevel: 'Medium', iconType: 'business', phone: '+265 991 223 445', email: 'i.mvula@pmail.mw', joinedAt: '2018-02-28', employeeNumber: 'EMP-0010', nationalId: 'NID-9921-0010' },
  { id: 'cust-011', userId: 'demo-customer-11', name: 'Precious Lungu', location: 'Salima', sector: 'Fisheries', activeLoans: 1, status: 'Pending', riskLevel: 'Medium', iconType: 'storefront', phone: '+265 888 334 556', email: 'p.lungu@pmail.mw', joinedAt: '2020-05-19', employeeNumber: 'EMP-0011', nationalId: 'NID-9921-0011' },
  { id: 'cust-012', userId: 'demo-customer-12', name: 'Gift Tembo', location: 'Mzuzu', sector: 'Technology', activeLoans: 1, status: 'Active', riskLevel: 'Low', iconType: 'business', phone: '+265 881 556 778', email: 'g.tembo@pmail.mw', joinedAt: '2017-10-22', employeeNumber: 'EMP-0012', nationalId: 'NID-9921-0012' },
  { id: 'cust-013', userId: 'demo-customer-13', name: 'Stella Nkosi', location: 'Blantyre', sector: 'Education', activeLoans: 1, status: 'Active', riskLevel: 'Low', iconType: 'storefront', phone: '+265 991 667 889', email: 's.nkosi@pmail.mw', joinedAt: '2018-07-14', employeeNumber: 'EMP-0013', nationalId: 'NID-9921-0013' },
  { id: 'cust-014', userId: 'demo-customer-14', name: 'Memory Phiri', location: 'Mangochi', sector: 'Hospitality', activeLoans: 1, status: 'Active', riskLevel: 'Low', iconType: 'business', phone: '+265 888 445 001', email: 'mem.phiri@pmail.mw', joinedAt: '2014-03-07', employeeNumber: 'EMP-0014', nationalId: 'NID-9921-0014' },
  { id: 'cust-015', userId: 'demo-customer-15', name: 'Wonder Kaunda', location: 'Dedza', sector: 'Agriculture', activeLoans: 0, status: 'Inactive', riskLevel: 'High', iconType: 'warning', phone: '+265 999 778 002', email: 'w.kaunda@pmail.mw', joinedAt: '2021-11-30', employeeNumber: 'EMP-0015', nationalId: 'NID-9921-0015' },
  { id: 'cust-016', name: 'Chimwemwe Banda', location: 'Lilongwe', sector: 'Manufacturing', activeLoans: 0, status: 'Active', riskLevel: 'Low', iconType: 'business', phone: '+265 881 889 003', email: 'c.banda@pmail.mw', joinedAt: '2019-04-18', employeeNumber: 'EMP-0016', nationalId: 'NID-9921-0016' },
  { id: 'cust-017', name: 'Happiness Kachingwe', location: 'Blantyre', sector: 'Services', activeLoans: 0, status: 'Active', riskLevel: 'Low', iconType: 'person', phone: '+265 991 990 004', email: 'h.kachingwe@pmail.mw', joinedAt: '2020-08-05', employeeNumber: 'EMP-0017', nationalId: 'NID-9921-0017' },
  { id: 'cust-018', name: 'Faith Kabwila', location: 'Mzuzu', sector: 'Education', activeLoans: 1, status: 'Active', riskLevel: 'Medium', iconType: 'storefront', phone: '+265 888 101 005', email: 'f.kabwila@pmail.mw', joinedAt: '2022-01-14', employeeNumber: 'EMP-0018', nationalId: 'NID-9921-0018' },
  { id: 'cust-019', name: 'Hope Chisanga', location: 'Zomba', sector: 'Healthcare', activeLoans: 0, status: 'Active', riskLevel: 'Low', iconType: 'person', phone: '+265 881 212 006', email: 'h.chisanga@pmail.mw', joinedAt: '2023-03-22', employeeNumber: 'EMP-0019', nationalId: 'NID-9921-0019' },
  { id: 'cust-020', name: 'Lusungu Dziko', location: 'Kasungu', sector: 'Agriculture', activeLoans: 2, status: 'Active', riskLevel: 'Medium', iconType: 'storefront', phone: '+265 999 323 007', email: 'l.dziko@pmail.mw', joinedAt: '2017-09-11', employeeNumber: 'EMP-0020', nationalId: 'NID-9921-0020' },
];

// ── Branches ────────────────────────────────────────────────────────────────

export const seedBranches: Branch[] = [
  {
    id: 'branch-lil',
    name: 'Lilongwe Main Branch',
    location: 'City Centre, Lilongwe',
    manager: 'Chisomo Banda',
    phone: '+265 1 753 200',
    email: 'lilongwe@pinnacle.mw',
    openedAt: '2014-01-15',
    activeLoans: 87,
    totalDisbursed: 520_000_000,
  },
  {
    id: 'branch-blt',
    name: 'Blantyre Commercial Branch',
    location: 'Ginnery Corner, Blantyre',
    manager: 'Grace Chirwa',
    phone: '+265 1 831 400',
    email: 'blantyre@pinnacle.mw',
    openedAt: '2015-06-01',
    activeLoans: 64,
    totalDisbursed: 380_000_000,
  },
  {
    id: 'branch-mzu',
    name: 'Mzuzu Northern Branch',
    location: 'Katoto, Mzuzu',
    manager: 'Innocent Gondwe',
    phone: '+265 1 331 700',
    email: 'mzuzu@pinnacle.mw',
    openedAt: '2018-03-10',
    activeLoans: 41,
    totalDisbursed: 190_000_000,
  },
];

// ── Loan Officers ───────────────────────────────────────────────────────────

export const seedLoanOfficers: LoanOfficer[] = [
  { id: 'lo-001', name: 'Chisomo Banda', branchId: 'branch-lil', branchName: 'Lilongwe Main Branch', email: 'c.banda@pinnacle.mw', phone: '+265 888 100 001', activeLoans: 32, disbursedThisMonth: 45_000_000, collectionRate: 97.8, joinedAt: '2016-03-01' },
  { id: 'lo-002', name: 'Kondwani Phiri', branchId: 'branch-lil', branchName: 'Lilongwe Main Branch', email: 'k.phiri@pinnacle.mw', phone: '+265 888 100 002', activeLoans: 28, disbursedThisMonth: 38_000_000, collectionRate: 96.5, joinedAt: '2017-08-15' },
  { id: 'lo-003', name: 'Stella Mwale', branchId: 'branch-blt', branchName: 'Blantyre Commercial Branch', email: 's.mwale@pinnacle.mw', phone: '+265 888 100 003', activeLoans: 25, disbursedThisMonth: 32_000_000, collectionRate: 98.2, joinedAt: '2018-01-10' },
  { id: 'lo-004', name: 'Innocent Gondwe', branchId: 'branch-mzu', branchName: 'Mzuzu Northern Branch', email: 'i.gondwe@pinnacle.mw', phone: '+265 888 100 004', activeLoans: 20, disbursedThisMonth: 22_000_000, collectionRate: 95.9, joinedAt: '2019-05-20' },
  { id: 'lo-005', name: 'Grace Chirwa', branchId: 'branch-blt', branchName: 'Blantyre Commercial Branch', email: 'g.chirwa@pinnacle.mw', phone: '+265 888 100 005', activeLoans: 19, disbursedThisMonth: 28_000_000, collectionRate: 97.1, joinedAt: '2020-02-14' },
];

// ── Loan Products ───────────────────────────────────────────────────────────

export const loanProducts: LoanProduct[] = [
  {
    id: 'prod-001',
    name: 'Personal Salary Loan',
    description: 'Flexible personal loans for salaried employees up to 3x monthly salary.',
    minAmount: 100_000,
    maxAmount: 5_000_000,
    minTermMonths: 3,
    maxTermMonths: 24,
    interestRate: 3.5,
    targetSegment: 'individual',
    isActive: true,
  },
  {
    id: 'prod-002',
    name: 'SME Working Capital',
    description: 'Business working capital to support inventory, payroll, and operations.',
    minAmount: 500_000,
    maxAmount: 30_000_000,
    minTermMonths: 6,
    maxTermMonths: 24,
    interestRate: 3.2,
    targetSegment: 'sme',
    isActive: true,
  },
  {
    id: 'prod-003',
    name: 'Agricultural Input Loan',
    description: 'Seasonal loans for farm inputs, seeds, and equipment.',
    minAmount: 200_000,
    maxAmount: 8_000_000,
    minTermMonths: 4,
    maxTermMonths: 12,
    interestRate: 3.0,
    targetSegment: 'both',
    isActive: true,
  },
  {
    id: 'prod-004',
    name: 'SME Expansion Loan',
    description: 'Capital for business expansion, renovation, or equipment purchase.',
    minAmount: 2_000_000,
    maxAmount: 50_000_000,
    minTermMonths: 12,
    maxTermMonths: 36,
    interestRate: 2.9,
    targetSegment: 'sme',
    isActive: true,
  },
  {
    id: 'prod-005',
    name: 'Emergency Relief Loan',
    description: 'Fast-disbursement emergency loans processed within 24 hours.',
    minAmount: 50_000,
    maxAmount: 1_000_000,
    minTermMonths: 1,
    maxTermMonths: 6,
    interestRate: 4.0,
    targetSegment: 'individual',
    isActive: true,
  },
];
