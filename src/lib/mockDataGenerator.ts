/**
 * Pinnacle Smart Advisor — Personalized Mock Data Generator
 *
 * Generates high-fidelity, believable financial portfolios for newly registered users.
 * Ensures the prototype demonstrates dynamic, tailored behavior per user.
 */

import type { StoredUser, LoanApplication, Repayment, AlertNotification, SmeBusiness, Customer } from '../types';
import { generateRepaymentSchedule } from '../mock/loans';

/**
 * Generate a complete mock data bundle for a newly registered user.
 */
export function generateUserMockBundle(user: StoredUser): {
  customer: Customer;
  applications: LoanApplication[];
  repayments: Repayment[];
  alerts: AlertNotification[];
  business?: SmeBusiness;
} {
  const isSME = user.customerType === 'sme';
  const sector = isSME ? (user.employer === 'Self-Employed' || !user.employer ? 'Retail' : 'Agriculture') : 'Personal';
  
  // 1. Create clean real Customer record (0 active loans initially)
  const customer: Customer = {
    id: `cust-${user.id}`,
    userId: user.id,
    name: user.fullName,
    location: user.address.split(',')[1]?.trim() || user.address || 'Lilongwe',
    sector: sector,
    activeLoans: 0,
    status: 'Active',
    riskLevel: 'Low',
    iconType: isSME ? 'storefront' : 'person',
    phone: user.phone,
    email: user.email,
    joinedAt: new Date().toISOString().split('T')[0],
  };

  // Newly registered user starts with NO loans and NO repayments
  const applications: LoanApplication[] = [];
  const repayments: Repayment[] = [];
  
  // 2. Initial welcome Alert Notification only
  const alerts: AlertNotification[] = [
    {
      id: `alert-user-${user.id}-1`,
      userId: user.id,
      type: 'approval',
      title: 'Welcome to Pinnacle MFI',
      description: `Hi ${user.fullName}, your digital lending account is active. You can now apply for loans.`,
      date: 'Just now',
    },
  ];

  // 3. SME Business profile if customer is SME
  let business: SmeBusiness | undefined;
  if (isSME) {
    const bizId = `biz-${user.id}`;
    business = {
      id: bizId,
      customerId: `cust-${user.id}`,
      customerName: user.fullName,
      name: `${user.fullName} Enterprises`,
      registrationNumber: `MB${new Date().getFullYear()}/${Math.floor(Math.random() * 90000) + 10000}`,
      sector: sector,
      industryCategory: sector === 'Agriculture' ? 'Agri-trading' : 'General Merchandise',
      location: user.address,
      verificationStatus: 'Pending Verification',
      relationshipManager: 'Unassigned',
      riskLevel: 'Low',
      annualRevenue: Number(user.monthlyIncome || 0) * 12,
      monthlyRevenue: Number(user.monthlyIncome || 0),
      employees: 1,
      yearsInBusiness: 1,
      healthScore: 70,
      owners: [
        { customerId: `cust-${user.id}`, customerName: user.fullName, role: 'Primary Owner', ownershipPct: 100, linkedAt: new Date().toISOString().split('T')[0] }
      ],
      documents: [],
      timeline: [
        { id: `tl-${user.id}-1`, businessId: bizId, date: new Date().toISOString().split('T')[0], title: 'Account Onboarded', detail: 'Completed digital registration profile.', type: 'relationship' }
      ],
      financingRequests: []
    };
  }

  return { customer, applications, repayments, alerts, business };
}


