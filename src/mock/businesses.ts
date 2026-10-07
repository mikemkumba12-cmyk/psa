/**
 * Pinnacle Smart Advisor — SME Businesses Mock Data
 *
 * Production replacement point:
 *   Replace with GET /api/businesses in src/services/businessService.ts
 */

import type { SmeBusiness } from '../types';

export const seedSmeBusinesses: SmeBusiness[] = [
  {
    id: 'biz-001',
    customerId: 'demo-customer-01',
    customerName: 'Samuel Chimwala',
    name: 'Chimwala Agri-Inputs Ltd',
    registrationNumber: 'MB2019/04821',
    sector: 'Agriculture',
    industryCategory: 'Farm Input Distribution',
    location: 'Area 12, Lilongwe',
    verificationStatus: 'Verified',
    relationshipManager: 'Chisomo Banda',
    riskLevel: 'Medium',
    annualRevenue: 51_000_000,
    monthlyRevenue: 4_250_000,
    employees: 8,
    yearsInBusiness: 4.5,
    healthScore: 72,
    owners: [
      { customerId: 'demo-customer-01', customerName: 'Samuel Chimwala', role: 'Primary Owner', ownershipPct: 100, linkedAt: '2022-03-15' },
    ],
    documents: [
      { id: 'doc-b001-1', businessId: 'biz-001', name: 'Certificate of Registration.pdf', category: 'Registration', status: 'Verified', uploadedAt: '2022-03-16', size: 245_000 },
      { id: 'doc-b001-2', businessId: 'biz-001', name: 'TRA Clearance Certificate.pdf', category: 'Tax', status: 'Verified', uploadedAt: '2022-03-16', size: 180_000 },
      { id: 'doc-b001-3', businessId: 'biz-001', name: 'Bank Statement Q3 2023.pdf', category: 'Bank Statement', status: 'Uploaded', uploadedAt: '2023-10-01', size: 512_000 },
    ],
    timeline: [
      { id: 'tl-b001-1', businessId: 'biz-001', date: '2019-04-10', title: 'Business Registered', detail: 'Registered with the Registrar General, Lilongwe.', type: 'registration' },
      { id: 'tl-b001-2', businessId: 'biz-001', date: '2022-03-15', title: 'Joined Pinnacle', detail: 'Onboarded as a Pinnacle SME client.', type: 'relationship' },
      { id: 'tl-b001-3', businessId: 'biz-001', date: '2023-10-24', title: 'Loan Application Submitted', detail: 'Applied for MWK 12,000,000 agricultural expansion loan.', type: 'financing' },
    ],
    financingRequests: [
      { id: 'fr-b001-1', businessId: 'biz-001', productName: 'SME Working Capital', amount: 12_000_000, termMonths: 24, purpose: 'Purchase of fertiliser and seed stock for 2024 growing season', status: 'Under Review', submittedAt: '2023-10-24' },
    ],
  },
  {
    id: 'biz-002',
    customerId: 'demo-customer-02',
    customerName: 'Bright Kamwendo',
    name: 'Bright Horizon Solar Systems',
    registrationNumber: 'MB2021/09143',
    sector: 'Sustainable Energy',
    industryCategory: 'Solar Installation & Retail',
    location: 'City Centre, Lilongwe',
    verificationStatus: 'Verified',
    relationshipManager: 'Kondwani Phiri',
    riskLevel: 'Low',
    annualRevenue: 62_400_000,
    monthlyRevenue: 5_200_000,
    employees: 12,
    yearsInBusiness: 2,
    healthScore: 88,
    owners: [
      { customerId: 'demo-customer-02', customerName: 'Bright Kamwendo', role: 'Primary Owner', ownershipPct: 80, linkedAt: '2021-07-20' },
    ],
    documents: [
      { id: 'doc-b002-1', businessId: 'biz-002', name: 'Certificate of Incorporation.pdf', category: 'Registration', status: 'Verified', uploadedAt: '2021-07-22', size: 310_000 },
      { id: 'doc-b002-2', businessId: 'biz-002', name: 'Energy Regulatory Authority Permit.pdf', category: 'Permit', status: 'Verified', uploadedAt: '2021-08-05', size: 420_000 },
      { id: 'doc-b002-3', businessId: 'biz-002', name: 'Financial Statements 2022.pdf', category: 'Financials', status: 'Verified', uploadedAt: '2023-02-10', size: 890_000 },
      { id: 'doc-b002-4', businessId: 'biz-002', name: 'Bank Statement Sep 2023.pdf', category: 'Bank Statement', status: 'Uploaded', uploadedAt: '2023-10-05', size: 620_000 },
    ],
    timeline: [
      { id: 'tl-b002-1', businessId: 'biz-002', date: '2021-07-15', title: 'Business Incorporated', detail: 'Incorporated under Companies Act. ERA permit granted.', type: 'registration' },
      { id: 'tl-b002-2', businessId: 'biz-002', date: '2021-07-20', title: 'Joined Pinnacle', detail: 'Introduced via SME referral programme.', type: 'relationship' },
      { id: 'tl-b002-3', businessId: 'biz-002', date: '2023-10-15', title: 'Expansion Loan Submitted', detail: 'Applied for MWK 8,500,000 to open Blantyre showroom.', type: 'financing' },
    ],
    financingRequests: [
      { id: 'fr-b002-1', businessId: 'biz-002', productName: 'SME Expansion Loan', amount: 8_500_000, termMonths: 18, purpose: 'Open Blantyre retail showroom and training centre', status: 'Under Review', submittedAt: '2023-10-15' },
    ],
  },
  {
    id: 'biz-003',
    customerId: 'demo-customer-05',
    customerName: 'Kondwani Msiska',
    name: 'Msiska Construction Co.',
    registrationNumber: 'MB2016/02291',
    sector: 'Construction',
    industryCategory: 'Civil & Commercial Construction',
    location: 'Area 25, Lilongwe',
    verificationStatus: 'Verified',
    relationshipManager: 'Chisomo Banda',
    riskLevel: 'Low',
    annualRevenue: 102_000_000,
    monthlyRevenue: 8_500_000,
    employees: 22,
    yearsInBusiness: 7,
    healthScore: 91,
    owners: [
      { customerId: 'demo-customer-05', customerName: 'Kondwani Msiska', role: 'Primary Owner', ownershipPct: 70, linkedAt: '2016-04-12' },
    ],
    documents: [
      { id: 'doc-b003-1', businessId: 'biz-003', name: 'Certificate of Registration.pdf', category: 'Registration', status: 'Verified', uploadedAt: '2016-04-13', size: 210_000 },
      { id: 'doc-b003-2', businessId: 'biz-003', name: 'NCIC Contractor Licence.pdf', category: 'Permit', status: 'Verified', uploadedAt: '2016-05-01', size: 380_000 },
      { id: 'doc-b003-3', businessId: 'biz-003', name: 'Audited Accounts 2022-2023.pdf', category: 'Financials', status: 'Verified', uploadedAt: '2023-09-01', size: 1_200_000 },
    ],
    timeline: [
      { id: 'tl-b003-1', businessId: 'biz-003', date: '2016-04-10', title: 'Founded', detail: 'Started as a 3-man team focused on residential construction.', type: 'registration' },
      { id: 'tl-b003-2', businessId: 'biz-003', date: '2016-04-12', title: 'First Pinnacle Loan', detail: 'MWK 2,000,000 equipment loan — repaid in full.', type: 'financing' },
      { id: 'tl-b003-3', businessId: 'biz-003', date: '2023-09-30', title: 'Third Expansion Loan Approved', detail: 'MWK 25,000,000 approved for government contract fulfilment.', type: 'financing' },
    ],
    financingRequests: [
      { id: 'fr-b003-1', businessId: 'biz-003', productName: 'SME Expansion Loan', amount: 25_000_000, termMonths: 24, purpose: 'Purchase of construction equipment for Lilongwe office complex contract', status: 'Approved', submittedAt: '2023-09-30' },
    ],
  },
  {
    id: 'biz-004',
    customerId: 'demo-customer-09',
    customerName: 'Mercy Gondwe',
    name: 'Gondwe Pharmacy',
    registrationNumber: 'MB2015/00891',
    sector: 'Healthcare',
    industryCategory: 'Community Pharmacy & Retail',
    location: 'Zomba Town Centre',
    verificationStatus: 'Verified',
    relationshipManager: 'Grace Chirwa',
    riskLevel: 'Low',
    annualRevenue: 45_600_000,
    monthlyRevenue: 3_800_000,
    employees: 9,
    yearsInBusiness: 8,
    healthScore: 94,
    owners: [
      { customerId: 'demo-customer-09', customerName: 'Mercy Gondwe', role: 'Primary Owner', ownershipPct: 100, linkedAt: '2015-06-03' },
    ],
    documents: [
      { id: 'doc-b004-1', businessId: 'biz-004', name: 'Pharmacy Council Licence.pdf', category: 'Permit', status: 'Verified', uploadedAt: '2015-06-04', size: 290_000 },
      { id: 'doc-b004-2', businessId: 'biz-004', name: 'Audited Accounts FY2022.pdf', category: 'Financials', status: 'Verified', uploadedAt: '2022-10-12', size: 780_000 },
    ],
    timeline: [
      { id: 'tl-b004-1', businessId: 'biz-004', date: '2015-06-01', title: 'Pharmacy Licensed', detail: 'Granted full pharmacy operating licence by Pharmacy Medicines and Poisons Board.', type: 'registration' },
      { id: 'tl-b004-2', businessId: 'biz-004', date: '2023-01-10', title: 'Expansion Loan Disbursed', detail: 'MWK 6,000,000 disbursed for second branch equipment.', type: 'financing' },
      { id: 'tl-b004-3', businessId: 'biz-004', date: '2024-01-18', title: 'Loan Completed', detail: 'Loan repaid in full — 12 days ahead of schedule.', type: 'financing' },
    ],
    financingRequests: [
      { id: 'fr-b004-1', businessId: 'biz-004', productName: 'SME Expansion Loan', amount: 6_000_000, termMonths: 12, purpose: 'Medical equipment and cold storage for Zomba second branch', status: 'Approved', submittedAt: '2023-01-10' },
    ],
  },
  {
    id: 'biz-005',
    customerId: 'demo-customer-14',
    customerName: 'Memory Phiri',
    name: 'Phiri Hospitality Group',
    registrationNumber: 'MB2014/00412',
    sector: 'Hospitality',
    industryCategory: 'Hotels, Lodges & Conference',
    location: 'Mangochi Lakeshore',
    verificationStatus: 'Verified',
    relationshipManager: 'Grace Chirwa',
    riskLevel: 'Low',
    annualRevenue: 90_000_000,
    monthlyRevenue: 7_500_000,
    employees: 28,
    yearsInBusiness: 9,
    healthScore: 90,
    owners: [
      { customerId: 'demo-customer-14', customerName: 'Memory Phiri', role: 'Primary Owner', ownershipPct: 60, linkedAt: '2014-03-07' },
    ],
    documents: [
      { id: 'doc-b005-1', businessId: 'biz-005', name: 'Hotel Operating Licence.pdf', category: 'Permit', status: 'Verified', uploadedAt: '2014-03-08', size: 340_000 },
      { id: 'doc-b005-2', businessId: 'biz-005', name: 'MIPA Investment Certificate.pdf', category: 'Registration', status: 'Verified', uploadedAt: '2014-04-01', size: 280_000 },
      { id: 'doc-b005-3', businessId: 'biz-005', name: 'Audited Accounts FY2022-2023.pdf', category: 'Financials', status: 'Verified', uploadedAt: '2023-08-15', size: 1_450_000 },
    ],
    timeline: [
      { id: 'tl-b005-1', businessId: 'biz-005', date: '2014-03-07', title: 'Founded', detail: 'Phiri Lakeshore Lodge opened with 8 chalets.', type: 'registration' },
      { id: 'tl-b005-2', businessId: 'biz-005', date: '2014-03-07', title: 'Pinnacle Founding Client', detail: 'Among first 10 SME clients onboarded at Pinnacle launch.', type: 'relationship' },
      { id: 'tl-b005-3', businessId: 'biz-005', date: '2023-07-15', title: 'Conference Centre Loan Disbursed', detail: 'MWK 22,000,000 approved for conference facility construction.', type: 'financing' },
    ],
    financingRequests: [
      { id: 'fr-b005-1', businessId: 'biz-005', productName: 'SME Expansion Loan', amount: 22_000_000, termMonths: 24, purpose: 'Build 200-seat conference centre at Mangochi Lakeshore', status: 'Approved', submittedAt: '2023-07-15' },
    ],
  },
];
