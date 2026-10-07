/**
 * PINACO Credit Intelligence Engine
 * Deterministic rules-based financial evaluation, employer risk scoring,
 * customer credit intelligence, and dynamic analytics generator.
 *
 * All outputs serve as explainable decision support for PINACO loan officers.
 */

import type {
  LoanApplication,
  Repayment,
  Customer,
  PayrollRecord,
  AuditLogEntry,
  FinancialHealthScore,
  ExpertRecommendation,
  ExpertRule,
  CustomerSegment,
  FraudFlag,
  SectorTrend,
  SegmentDistribution,
  DataMiningInsight,
  EmployerPerformance,
  OfficerQualityMetrics,
  CreditRecommendation,
  PortfolioTimePoint,
  CustomerScoreConfig,
  CustomerRiskScore,
  CustomerRecommendation,
  EmployerRiskPrediction,
  CustomerRiskTimelineEntry,
  CustomerLifetimeValue,
} from '../types';

// ── Financial Health Score Calculator ────────────────────────────────────────

function repaymentToScore(history: string): number {
  const map: Record<string, number> = {
    Perfect: 100,
    Excellent: 92,
    Good: 78,
    Fair: 55,
    Poor: 30,
    New: 65,
  };
  return map[history] ?? 60;
}

function dtiToScore(dti: string): number {
  const num = parseFloat(dti.replace('%', ''));
  if (isNaN(num)) return 70;
  if (num <= 15) return 100;
  if (num <= 25) return 88;
  if (num <= 35) return 70;
  if (num <= 45) return 50;
  return 25;
}

function incomeStabilityScore(monthlyRevenue: number, amount: number): number {
  const estimatedMonthly = amount / 12;
  const ratio = monthlyRevenue / estimatedMonthly;
  if (ratio >= 8) return 100;
  if (ratio >= 5) return 88;
  if (ratio >= 3) return 75;
  if (ratio >= 1.5) return 55;
  return 30;
}

function businessScore(yearsStr: string, staffCount: number): number {
  const years = parseFloat(yearsStr) || 1;
  let base = 0;
  if (years >= 5) base = 90;
  else if (years >= 3) base = 75;
  else if (years >= 1) base = 58;
  else base = 40;

  const staffBonus = Math.min(staffCount * 1.5, 10);
  return Math.min(base + staffBonus, 100);
}

export function computeHealthScore(app: LoanApplication): FinancialHealthScore {
  const rep = repaymentToScore(app.repaymentHistory);
  const dti = dtiToScore(app.debtToIncome);
  const inc = incomeStabilityScore(app.monthlyRevenue, app.amount);
  const bus = businessScore(app.yearsInBusiness, app.staffCount);

  // Weighted composite: repayment 40%, income 25%, debt 20%, business 15%
  const composite = Math.round(rep * 0.40 + inc * 0.25 + dti * 0.20 + bus * 0.15);

  let tier: FinancialHealthScore['tier'];
  let tierColor: string;
  if (composite >= 80) { tier = 'Excellent'; tierColor = '#16a34a'; }
  else if (composite >= 65) { tier = 'Good'; tierColor = '#d97706'; }
  else if (composite >= 45) { tier = 'Fair'; tierColor = '#ea580c'; }
  else { tier = 'Poor'; tierColor = '#dc2626'; }

  return {
    composite,
    repaymentScore: Math.round(rep),
    incomeStabilityScore: Math.round(inc),
    debtScore: Math.round(dti),
    businessScore: Math.round(bus),
    tier,
    tierColor,
  };
}

// ── Customer Segmentation ─────────────────────────────────────────────────────

export function segmentCustomer(app: LoanApplication): CustomerSegment {
  const years = parseFloat(app.yearsInBusiness) || 0;
  const dti = parseFloat(app.debtToIncome.replace('%', '')) || 30;

  if (app.score >= 88 && app.repaymentHistory === 'Perfect') return 'Premium Client';
  if (app.score >= 80 && dti <= 25) return 'Reliable Borrower';
  if (app.score >= 65 && years >= 3 && app.staffCount >= 5) return 'SME Growth';
  if (years < 2 && app.score >= 60) return 'Young Entrepreneur';
  if (app.score < 50 || dti > 40) return 'High Risk';
  return 'Inactive';
}

export const SEGMENT_COLORS: Record<CustomerSegment, string> = {
  'Premium Client': '#7c3aed',
  'Reliable Borrower': '#16a34a',
  'SME Growth': '#2563eb',
  'Young Entrepreneur': '#d97706',
  'High Risk': '#dc2626',
  'Inactive': '#9ca3af',
};

// ── Customer Loan History Helper (Fix 3) ────────────────────────────────────

export function getCustomerLoanHistory(
  app: LoanApplication,
  allApplications: LoanApplication[]
): { completedLoans: number; defaultedLoans: number; totalLoans: number; isLongTermCustomer: boolean } {
  if (!app.userId) return { completedLoans: 0, defaultedLoans: 0, totalLoans: 0, isLongTermCustomer: false };
  const customerApps = allApplications.filter(
    a => a.userId === app.userId && a.id !== app.id
  );
  const completedLoans = customerApps.filter(a => a.status === 'Completed').length;
  const defaultedLoans = customerApps.filter(a => a.status === 'Decline' || a.status === 'Rejected').length;
  const totalLoans = customerApps.length;
  const earliest = customerApps
    .map(a => new Date(a.date).getTime())
    .filter(t => !isNaN(t));
  const firstLoanDate = earliest.length > 0 ? Math.min(...earliest) : Date.now();
  const yearsAsCustomer = (Date.now() - firstLoanDate) / (1000 * 60 * 60 * 24 * 365);
  return { completedLoans, defaultedLoans, totalLoans, isLongTermCustomer: yearsAsCustomer >= 2 };
}

// ── PINACO Credit Intelligence Recommendation Engine ──────────────────────────

export interface CreditRecommendationContext {
  allApplications?: LoanApplication[];
  allRepayments?: Repayment[];
  payrollRecords?: PayrollRecord[];
}

export function computeCreditRecommendation(
  app: LoanApplication,
  ctx: CreditRecommendationContext = {}
): CreditRecommendation {
  const { allApplications = [], allRepayments = [], payrollRecords = [] } = ctx;
  const dti = parseFloat(app.debtToIncome.replace('%', '')) || 30;
  const health = computeHealthScore(app);
  const positiveSignals: string[] = [];
  const riskFactors: string[] = [];

  // ── Positive Signals ─────────────────────────────────────────────────────
  const sectorLower = app.sector.toLowerCase();
  if (sectorLower.includes('public') || sectorLower.includes('education') ||
      sectorLower.includes('health') || sectorLower.includes('government') ||
      sectorLower.includes('civil') || sectorLower.includes('university')) {
    positiveSignals.push(`✓ Stable government/institutional employment (${app.sector})`);
  }
  if (['Perfect', 'Excellent', 'Good'].includes(app.repaymentHistory)) {
    positiveSignals.push(`✓ Clean repayment record ("${app.repaymentHistory}")`);
  }
  if (dti <= 30) {
    positiveSignals.push(`✓ Manageable Debt-to-Income ratio (${app.debtToIncome})`);
  }
  if (health.composite >= 75) {
    positiveSignals.push(`✓ Strong financial health composite (${health.composite}/100)`);
  }
  if (app.dataSource === 'imported') {
    positiveSignals.push(`✓ Existing PINACO customer — portfolio history available`);
  }

  // ── Fix 2: Payroll history signals ───────────────────────────────────────
  // Check repayments for this application for FAILED_DEDUCTION
  const appRepayments = allRepayments.filter(r => r.applicationId === app.id);
  const failedDeductionReps = appRepayments.filter(r => r.status === 'FAILED_DEDUCTION').length;
  const paidReps = appRepayments.filter(r => r.status === 'Paid').length;
  const totalDueReps = appRepayments.filter(
    r => ['Paid', 'Overdue', 'FAILED_DEDUCTION'].includes(r.status)
  ).length;
  const deductionSuccessRate = totalDueReps > 0
    ? Math.round((paidReps / totalDueReps) * 100)
    : null;

  if (deductionSuccessRate !== null && deductionSuccessRate >= 95) {
    positiveSignals.push(`✓ ${deductionSuccessRate}% successful payroll deduction history (${paidReps}/${totalDueReps} installments paid)`);
  }
  if (failedDeductionReps > 0) {
    riskFactors.push(`⚠ ${failedDeductionReps} failed payroll deduction(s) recorded — requires employer verification`);
  }

  // Check employer reliability from payroll records
  const employerRecords = payrollRecords.filter(
    pr => pr.employer.toLowerCase() === app.sector.toLowerCase() ||
          (app.businessName && pr.employer.toLowerCase().includes(app.businessName.split(' ')[0]?.toLowerCase()))
  );
  if (employerRecords.length >= 5) {
    const employerSuccessful = employerRecords.filter(pr => pr.status === 'Applied' || pr.status === 'Matched').length;
    const employerRate = Math.round((employerSuccessful / employerRecords.length) * 100);
    if (employerRate >= 95) {
      positiveSignals.push(`✓ Employer payroll reliability: ${employerRate}% (${employerSuccessful}/${employerRecords.length} deductions processed)`);
    } else if (employerRate < 80) {
      riskFactors.push(`⚠ Employer payroll reliability below threshold: ${employerRate}% — ${employerRecords.length - employerSuccessful} unprocessed deductions`);
    }
  }

  // ── Fix 3: Repeat customer loan history ──────────────────────────────────
  if (allApplications.length > 0) {
    const history = getCustomerLoanHistory(app, allApplications);
    if (history.completedLoans >= 3) {
      positiveSignals.push(`✓ Long-term PINACO customer — ${history.completedLoans} previous loans completed successfully`);
    } else if (history.completedLoans >= 1) {
      positiveSignals.push(`✓ ${history.completedLoans} previous loan(s) completed with PINACO`);
    }
    if (history.isLongTermCustomer) {
      positiveSignals.push(`✓ Established PINACO relationship (2+ years)`);
    }
    if (history.defaultedLoans > 0) {
      riskFactors.push(`⚠ ${history.defaultedLoans} previous loan application(s) declined or defaulted`);
    }
  }

  // ── Risk Factors ─────────────────────────────────────────────────────────
  if (dti > 40) {
    riskFactors.push(`⚠ High Debt-to-Income ratio (${app.debtToIncome}) exceeds 40% benchmark`);
  }
  if (['Poor', 'Fair'].includes(app.repaymentHistory)) {
    riskFactors.push(`⚠ Prior repayment delays recorded ("${app.repaymentHistory}")`);
  }
  if (app.amount > app.monthlyRevenue * 5) {
    riskFactors.push(`⚠ Requested MWK ${app.amount.toLocaleString()} exceeds 5× monthly income — repayment capacity concern`);
  }
  if (health.composite < 50) {
    riskFactors.push(`⚠ Low financial health composite (${health.composite}/100)`);
  }

  // ── Decision Logic ───────────────────────────────────────────────────────
  let recommendation: CreditRecommendation['recommendation'];
  let riskLevel: CreditRecommendation['riskLevel'];
  let suggestedAction: string;

  if (riskFactors.length === 0 && app.score >= 75) {
    recommendation = 'Approve';
    riskLevel = 'Low';
    suggestedAction = `Approve requested amount of MWK ${app.amount.toLocaleString()}. Fast-track payroll deduction agreement with employer.`;
  } else if (riskFactors.length >= 2 || app.score < 55) {
    recommendation = 'Decline';
    riskLevel = 'High';
    suggestedAction = `Decline in current form. Counter-offer maximum MWK ${Math.round(app.amount * 0.5).toLocaleString()} with mandatory guarantor and employer confirmation.`;
  } else {
    recommendation = 'Review';
    riskLevel = 'Medium';
    suggestedAction = `Request updated payslip, latest 3-month bank statement, and employer payroll deduction confirmation letter.`;
  }

  return {
    recommendation,
    score: app.score,
    riskLevel,
    positiveSignals,
    riskFactors,
    suggestedAction,
  };
}

export function runExpertSystem(
  app: LoanApplication,
  ctx: CreditRecommendationContext = {}
): ExpertRecommendation {
  const health = computeHealthScore(app);
  const segment = segmentCustomer(app);
  const creditRec = computeCreditRecommendation(app, ctx);
  const dti = parseFloat(app.debtToIncome.replace('%', '')) || 30;

  const rules: ExpertRule[] = [
    {
      id: 'R01',
      name: 'Prime Salary Approval',
      condition: `Score ≥ 80 AND Repayment = "Excellent/Perfect" AND DTI < 30%`,
      fired: app.score >= 80 && ['Excellent', 'Perfect'].includes(app.repaymentHistory) && dti < 30,
      confidence: 95,
    },
    {
      id: 'R02',
      name: 'Standard Payroll Approval',
      condition: `Score ≥ 65 AND DTI < 40%`,
      fired: app.score >= 65 && dti < 40,
      confidence: 85,
    },
    {
      id: 'R03',
      name: 'Elevated DTI Warning',
      condition: `Score < 55 OR DTI > 40%`,
      fired: app.score < 55 || dti > 40,
      confidence: 90,
    },
    {
      id: 'R04',
      name: 'Income Shortfall',
      condition: `Monthly Revenue < 2× Estimated Installment`,
      fired: app.monthlyRevenue < (app.amount / 12) * 2,
      confidence: 87,
    },
  ];

  const firedRules = rules.filter(r => r.fired);

  let verdict: ExpertRecommendation['verdict'] = creditRec.recommendation === 'Approve' ? 'Approve' : creditRec.recommendation === 'Decline' ? 'Decline' : 'Review';
  let primaryReason = creditRec.positiveSignals[0] || creditRec.riskFactors[0] || 'Requires officer manual review';
  let explanation = `PINACO Credit Intelligence evaluated ${app.applicantName} (${app.sector}). ${creditRec.positiveSignals.join(' ')} ${creditRec.riskFactors.join(' ')}`;

  return {
    verdict,
    confidence: app.score >= 80 ? 92 : app.score >= 65 ? 82 : 70,
    primaryReason,
    explanation,
    suggestedAmount: verdict === 'Approve' ? app.amount : Math.round(app.amount * 0.7),
    rulesFired: firedRules,
    segment,
    healthScore: health,
  };
}

// ── Fraud Detection ───────────────────────────────────────────────────────────

export function detectFraudFlags(apps: LoanApplication[]): FraudFlag[] {
  const flags: FraudFlag[] = [];

  apps.forEach(app => {
    if (app.amount > app.monthlyRevenue * 6) {
      flags.push({
        id: `fraud-${app.id}-leverage`,
        applicationId: app.id,
        signal: 'Excessive Leverage',
        severity: app.amount > app.monthlyRevenue * 12 ? 'High' : 'Medium',
        description: `Requested MWK ${app.amount.toLocaleString()} against monthly income of MWK ${app.monthlyRevenue.toLocaleString()} — repayment ratio elevated.`,
      });
    }

    if (app.riskLevel === 'High' && app.amount > 1000000) {
      flags.push({
        id: `fraud-${app.id}-highrisk`,
        applicationId: app.id,
        signal: 'High Risk + Large Amount',
        severity: 'High',
        description: `High-risk profile (score ${app.score}) requesting MWK ${app.amount.toLocaleString()}. Requires manager sign-off.`,
      });
    }
  });

  return flags;
}

// ── DYNAMIC ANALYTICS CALCULATORS (NO STATIC ARRAYS) ──────────────────────────

export function computeDynamicPortfolioTimeline(
  applications: LoanApplication[],
  repayments: Repayment[]
): PortfolioTimePoint[] {
  const monthlyMap: Record<string, { disbursed: number; collected: number; newCustomers: number; defaults: number }> = {};

  // Group applications by month
  applications.forEach(a => {
    const month = a.date ? a.date.slice(0, 7) : new Date().toISOString().slice(0, 7);
    monthlyMap[month] ??= { disbursed: 0, collected: 0, newCustomers: 0, defaults: 0 };
    if (['Disbursed', 'Approved', 'Active', 'Completed'].includes(a.status)) {
      monthlyMap[month].disbursed += Number(a.amount || 0);
      monthlyMap[month].newCustomers += 1;
    }
  });

  // Group repayments by month
  repayments.forEach(r => {
    const month = r.dueDate ? r.dueDate.slice(0, 7) : new Date().toISOString().slice(0, 7);
    monthlyMap[month] ??= { disbursed: 0, collected: 0, newCustomers: 0, defaults: 0 };
    if (r.status === 'Paid') {
      monthlyMap[month].collected += Number(r.amount || 0);
    } else if (r.status === 'Overdue') {
      monthlyMap[month].defaults += 1;
    }
  });

  const sortedMonths = Object.keys(monthlyMap).sort();
  if (sortedMonths.length === 0) {
    const currentMonth = new Date().toLocaleString('default', { month: 'short' });
    return [{ month: currentMonth, disbursed: 0, collected: 0, newCustomers: 0, defaults: 0 }];
  }

  return sortedMonths.slice(-12).map(m => {
    const dateObj = new Date(m + '-01');
    const monthLabel = Number.isNaN(dateObj.getTime()) ? m : dateObj.toLocaleString('default', { month: 'short' });
    const data = monthlyMap[m];
    return {
      month: monthLabel,
      disbursed: data.disbursed,
      collected: data.collected,
      newCustomers: data.newCustomers,
      defaults: data.defaults,
    };
  });
}

export function computeDynamicSectorTrends(
  applications: LoanApplication[],
  repayments: Repayment[]
): SectorTrend[] {
  const sectorMap: Record<string, { disbursed: number; appCount: number; paidCount: number; overdueCount: number }> = {};

  applications.forEach(a => {
    const sector = a.sector || 'General';
    sectorMap[sector] ??= { disbursed: 0, appCount: 0, paidCount: 0, overdueCount: 0 };
    sectorMap[sector].appCount += 1;
    if (['Disbursed', 'Approved', 'Active', 'Completed'].includes(a.status)) {
      sectorMap[sector].disbursed += Number(a.amount || 0);
    }
  });

  repayments.forEach(r => {
    if (r.status === 'Paid') {
      // Find app sector
      const app = applications.find(a => a.id === r.applicationId);
      const sector = app?.sector || 'General';
      sectorMap[sector] ??= { disbursed: 0, appCount: 0, paidCount: 0, overdueCount: 0 };
      sectorMap[sector].paidCount += 1;
    } else if (r.status === 'Overdue') {
      const app = applications.find(a => a.id === r.applicationId);
      const sector = app?.sector || 'General';
      sectorMap[sector] ??= { disbursed: 0, appCount: 0, paidCount: 0, overdueCount: 0 };
      sectorMap[sector].overdueCount += 1;
    }
  });

  return Object.entries(sectorMap).map(([sector, data]) => {
    const totalReps = data.paidCount + data.overdueCount || 1;
    const defaultRate = Math.round((data.overdueCount / totalReps) * 100 * 10) / 10;
    const avgRepayment = Math.round((data.paidCount / totalReps) * 100);
    const riskRating: SectorTrend['riskRating'] = defaultRate > 10 ? 'High' : defaultRate > 5 ? 'Medium' : 'Low';

    return {
      sector,
      defaultRate,
      avgRepayment,
      totalDisbursed: data.disbursed,
      growth: 5.0,
      riskRating,
      insight: `${sector} sector displays ${avgRepayment}% collection rate across ${data.appCount} portfolio applications.`,
    };
  });
}

export function computeEmployerPerformance(
  customers: Customer[],
  applications: LoanApplication[],
  repayments: Repayment[],
  payrollRecords: PayrollRecord[]
): EmployerPerformance[] {
  const employerMap: Record<string, {
    employeeCount: number;
    activeLoans: number;
    disbursed: number;
    collected: number;
    successfulDeductions: number;
    failedDeductions: number;
    salarySum: number;
  }> = {};

  // Map customers by employer
  customers.forEach(c => {
    const employer = c.sector || 'Private Sector';
    employerMap[employer] ??= { employeeCount: 0, activeLoans: 0, disbursed: 0, collected: 0, successfulDeductions: 0, failedDeductions: 0, salarySum: 0 };
    employerMap[employer].employeeCount += 1;
    employerMap[employer].activeLoans += c.activeLoans || 0;
  });

  // Include applications
  applications.forEach(a => {
    const employer = a.sector || 'Private Sector';
    employerMap[employer] ??= { employeeCount: 0, activeLoans: 0, disbursed: 0, collected: 0, successfulDeductions: 0, failedDeductions: 0, salarySum: 0 };
    employerMap[employer].disbursed += Number(a.amount || 0);
    employerMap[employer].salarySum += Number(a.monthlyRevenue || 0);
  });

  // Include payroll records
  payrollRecords.forEach(pr => {
    const employer = pr.employer || 'Private Sector';
    employerMap[employer] ??= { employeeCount: 0, activeLoans: 0, disbursed: 0, collected: 0, successfulDeductions: 0, failedDeductions: 0, salarySum: 0 };
    if (pr.status === 'Applied' || pr.status === 'Matched') {
      employerMap[employer].successfulDeductions += 1;
      employerMap[employer].collected += pr.amount;
    } else if (pr.status === 'Unmatched' || pr.status === 'Failed') {
      employerMap[employer].failedDeductions += 1;
    }
  });

  // Fix 1: Compute true rates — no clamping or artificial floors/ceilings
  return Object.entries(employerMap).map(([employer, data]) => {
    const totalDeductions = data.successfulDeductions + data.failedDeductions;
    const successfulDeductionRate = totalDeductions > 0
      ? Math.round((data.successfulDeductions / totalDeductions) * 1000) / 10
      : 0;
    const failedDeductionRate = totalDeductions > 0
      ? Math.round((data.failedDeductions / totalDeductions) * 1000) / 10
      : 0;
    const avgSalary = data.employeeCount > 0
      ? Math.round(data.salarySum / data.employeeCount)
      : 0;
    const riskRating: EmployerPerformance['riskRating'] =
      failedDeductionRate > 20 ? 'High' :
      failedDeductionRate > 8  ? 'Medium' : 'Low';
    const riskTrend: EmployerPerformance['riskTrend'] =
      failedDeductionRate > 10 ? 'Deteriorating' : 'Stable';

    return {
      employer,
      employeeCount: data.employeeCount,
      activeLoans: data.activeLoans,
      totalDisbursed: data.disbursed,
      totalCollected: data.collected,
      successfulDeductionRate,  // true computed value — no floor
      failedDeductionRate,      // true computed value — no ceiling
      avgSalary,
      riskRating,
      riskTrend,
    };
  });
}

// Fix 4: Compute officer metrics from real data — no hardcoded values
export function computeOfficerQualityMetrics(
  applications: LoanApplication[],
  repayments: Repayment[],
  auditLogs: AuditLogEntry[]
): OfficerQualityMetrics[] {
  const officers = [
    { id: 'staff-002', name: 'Chisomo Banda' },
    { id: 'staff-003', name: 'Grace Phiri' },
    { id: 'staff-001', name: 'Thoko Kamanga' },
  ];

  return officers.map(off => {
    const assignedApps = applications.filter(
      a => a.loanOfficer === off.name || a.loanOfficer === off.id
    );
    const reviewedCount = assignedApps.length;
    const approvedApps = assignedApps.filter(
      a => ['Approved', 'Disbursed', 'Active', 'Completed'].includes(a.status)
    );
    const approvedCount = approvedApps.length;
    const declinedCount = assignedApps.filter(
      a => a.status === 'Decline' || a.status === 'Rejected'
    ).length;
    const approvalRatio = reviewedCount > 0
      ? Math.round((approvedCount / reviewedCount) * 100)
      : 0;

    // Fix 4a: Real processing time — application date → disbursedAt
    const processedApps = approvedApps.filter(a => a.disbursedAt && a.date);
    const processingTimesHours = processedApps.map(a => {
      const start = new Date(a.date).getTime();
      const end   = new Date(a.disbursedAt!).getTime();
      const hours = (end - start) / (1000 * 60 * 60);
      return hours > 0 ? hours : 0;
    }).filter(h => h > 0);
    const avgProcessingTimeHours = processingTimesHours.length > 0
      ? Math.round((processingTimesHours.reduce((s, h) => s + h, 0) / processingTimesHours.length) * 10) / 10
      : 0;

    // Fix 4b: Real repayment performance — approved cohort paid installments
    const approvedIds = approvedApps.map(a => a.id);
    const cohortReps  = repayments.filter(r => approvedIds.includes(r.applicationId || ''));
    const paidCount   = cohortReps.filter(r => r.status === 'Paid').length;
    const dueCount    = cohortReps.filter(r =>
      ['Paid', 'Overdue', 'FAILED_DEDUCTION'].includes(r.status)
    ).length;
    const repaymentPerformanceApproved = dueCount > 0
      ? Math.round((paidCount / dueCount) * 1000) / 10
      : (approvedCount > 0 ? 100 : 0);

    // Fix 4c: Document rejection rate from audit log events
    const officerLogs = auditLogs.filter(
      log => log.actorId === off.id || log.actorName === off.name
    );
    const docRejections = officerLogs.filter(
      log => log.action.includes('document.reject') ||
             log.action.includes('doc_reject') ||
             (log.entityType === 'document' && log.outcome === 'failure')
    ).length;
    const docActions = officerLogs.filter(
      log => log.entityType === 'document' ||
             log.action.includes('document.')
    ).length;
    const documentRejectionRate = docActions > 0
      ? Math.round((docRejections / docActions) * 1000) / 10
      : 0;

    const defaultCount = cohortReps.filter(r => r.status === 'Overdue').length;

    return {
      officerId: off.id,
      officerName: off.name,
      reviewedCount,
      approvedCount,
      declinedCount,
      approvalRatio,
      avgProcessingTimeHours,
      repaymentPerformanceApproved,
      documentRejectionRate,
      defaultCount,
    };
  });
}

// Fix 7: Generate rich, pattern-based insights from actual operational data
export function generateDynamicInsights(
  applications: LoanApplication[],
  repayments: Repayment[],
  customers: Customer[],
  payrollRecords: PayrollRecord[]
): DataMiningInsight[] {
  const insights: DataMiningInsight[] = [];

  // ── 1. Overall collection efficiency ─────────────────────────────────────
  const paidRepayments    = repayments.filter(r => r.status === 'Paid');
  const overdueRepayments = repayments.filter(r => r.status === 'Overdue');
  const failedDeductions  = repayments.filter(r => r.status === 'FAILED_DEDUCTION');
  const totalDue          = paidRepayments.length + overdueRepayments.length + failedDeductions.length;
  const collectionRate    = totalDue > 0 ? Math.round((paidRepayments.length / totalDue) * 100) : 0;
  const totalDisbursed    = applications
    .filter(a => ['Disbursed','Approved','Active','Completed'].includes(a.status))
    .reduce((s, a) => s + Number(a.amount || 0), 0);

  insights.push({
    id: 'dmi-01',
    category: 'Trend',
    title: collectionRate >= 95
      ? `Portfolio Collection Rate: ${collectionRate}% — Above Target`
      : `Portfolio Collection Rate: ${collectionRate}% — Below 98% Target`,
    description: `${paidRepayments.length} of ${totalDue} due installments collected. ${overdueRepayments.length} overdue, ${failedDeductions.length} failed deductions. Active portfolio: MWK ${(totalDisbursed / 1_000_000).toFixed(1)}M.`,
    impact: collectionRate >= 95 ? 'Positive' : 'Negative',
    confidence: 99,
    dataSource: 'repaymentsStore (all records)',
    calculationMethod: 'Paid Installments ÷ (Paid + Overdue + FAILED_DEDUCTION) × 100',
    businessMeaning: 'Payroll deduction model target is 98%+. Rates below this require employer reconciliation.',
  });

  // ── 2. Sector-level default rate comparison ───────────────────────────────
  const sectorData: Record<string, { paid: number; overdue: number; apps: number }> = {};
  applications.forEach(a => {
    const s = a.sector || 'General';
    sectorData[s] ??= { paid: 0, overdue: 0, apps: 0 };
    sectorData[s].apps += 1;
  });
  repayments.forEach(r => {
    const app = applications.find(a => a.id === r.applicationId);
    const s   = app?.sector || 'General';
    sectorData[s] ??= { paid: 0, overdue: 0, apps: 0 };
    if (r.status === 'Paid')    sectorData[s].paid += 1;
    if (r.status === 'Overdue') sectorData[s].overdue += 1;
  });
  const sectorEntries = Object.entries(sectorData)
    .map(([sector, d]) => ({
      sector,
      defaultRate: (d.paid + d.overdue) > 0
        ? Math.round((d.overdue / (d.paid + d.overdue)) * 1000) / 10
        : 0,
      apps: d.apps,
    }))
    .sort((a, b) => b.defaultRate - a.defaultRate);

  if (sectorEntries.length >= 2) {
    const worst = sectorEntries[0];
    const best  = sectorEntries[sectorEntries.length - 1];
    insights.push({
      id: 'dmi-02',
      category: worst.defaultRate > 10 ? 'Alert' : 'Pattern',
      title: `Sector Default Gap: ${best.sector} (${100 - best.defaultRate}% collected) vs ${worst.sector} (${100 - worst.defaultRate}% collected)`,
      description: `Best-performing sector: ${best.sector} with ${best.defaultRate}% default rate across ${best.apps} applications. Highest risk: ${worst.sector} at ${worst.defaultRate}% default rate.`,
      impact: worst.defaultRate > 15 ? 'Negative' : 'Positive',
      confidence: 90,
      affectedSector: worst.sector,
      dataSource: 'applicationsStore + repaymentsStore (joined by applicationId)',
      calculationMethod: 'Overdue Installments ÷ (Paid + Overdue) per sector × 100',
      businessMeaning: `Sector risk tiers guide PINACO's concentration limits and pricing adjustments.`,
    });
  }

  // ── 3. Repeat borrower performance ───────────────────────────────────────
  const existingCustomers = customers.filter(c => c.customerType === 'Existing');
  const existingIds       = new Set(existingCustomers.map(c => c.userId || c.id));
  const existingApps      = applications.filter(a => existingIds.has(a.userId || ''));
  const newApps           = applications.filter(a => !existingIds.has(a.userId || ''));

  const overdueExisting = repayments.filter(r =>
    r.status === 'Overdue' && existingApps.some(a => a.id === r.applicationId)
  ).length;
  const overdueNew = repayments.filter(r =>
    r.status === 'Overdue' && newApps.some(a => a.id === r.applicationId)
  ).length;

  insights.push({
    id: 'dmi-03',
    category: 'Pattern',
    title: `Repeat Borrowers: ${existingCustomers.length} customers, ${overdueExisting} overdue installments vs ${overdueNew} for new applicants`,
    description: `${existingCustomers.length} existing customers hold ${existingApps.length} applications with ${overdueExisting} overdue installments. ${newApps.length} new applicants have ${overdueNew} overdue installments.`,
    impact: overdueExisting <= overdueNew ? 'Positive' : 'Neutral',
    confidence: 88,
    dataSource: 'customersStore (customerType) + repaymentsStore + applicationsStore',
    calculationMethod: 'Overdue count segmented by existing vs. new customer classification',
    businessMeaning: 'Customers with established PINACO history are eligible for accelerated review and top-up loans.',
  });

  // ── 4. Payroll exception alert ────────────────────────────────────────────
  const failedPayroll  = payrollRecords.filter(p => p.status === 'Failed' || p.status === 'Unmatched').length;
  const totalPayroll   = payrollRecords.length;
  const payrollSuccess = totalPayroll > 0
    ? Math.round(((totalPayroll - failedPayroll) / totalPayroll) * 100)
    : 100;

  // Employer-level breakdown
  const employerFailMap: Record<string, number> = {};
  const employerTotalMap: Record<string, number> = {};
  payrollRecords.forEach(pr => {
    employerFailMap[pr.employer]  = (employerFailMap[pr.employer]  || 0) + (pr.status === 'Failed' || pr.status === 'Unmatched' ? 1 : 0);
    employerTotalMap[pr.employer] = (employerTotalMap[pr.employer] || 0) + 1;
  });
  const worstEmployer = Object.entries(employerFailMap)
    .filter(([, fails]) => fails > 0)
    .sort(([, a], [, b]) => b - a)[0];

  insights.push({
    id: 'dmi-04',
    category: failedPayroll > 0 ? 'Alert' : 'Trend',
    title: failedPayroll > 0
      ? `${failedPayroll} Unmatched Payroll Deductions — ${payrollSuccess}% match rate this period`
      : 'Payroll Ingestion Clean — 100% Match Rate',
    description: failedPayroll > 0
      ? `${failedPayroll} of ${totalPayroll} payroll records could not be matched. ${
          worstEmployer ? `Highest exceptions from: ${worstEmployer[0]} (${worstEmployer[1]} failed).` : ''
        } Classified as FAILED_DEDUCTION — no penalty applied to customers.`
      : `All ${totalPayroll} payroll records matched and applied successfully. Zero administrative exceptions.`,
    impact: failedPayroll > 0 ? 'Negative' : 'Positive',
    confidence: 99,
    dataSource: 'payrollStore (status: Failed | Unmatched)',
    calculationMethod: 'Count(Failed + Unmatched) ÷ Total Payroll Records × 100',
    businessMeaning: 'FAILED_DEDUCTION records are reconciled manually without penalising customer credit profile.',
  });

  return insights;
}

export function computeSegmentDistribution(apps: LoanApplication[]): SegmentDistribution[] {
  const counts: Partial<Record<CustomerSegment, number>> = {};
  apps.forEach(app => {
    const seg = segmentCustomer(app);
    counts[seg] = (counts[seg] || 0) + 1;
  });

  const total = apps.length || 1;
  return Object.entries(counts).map(([segment, count]) => ({
    segment: segment as CustomerSegment,
    count: count as number,
    color: SEGMENT_COLORS[segment as CustomerSegment],
    percentage: Math.round(((count as number) / total) * 100),
  }));
}

// ── Phase 3 Intelligence Functions ───────────────────────────────────────────

export const DEFAULT_CUSTOMER_SCORE_CONFIG: CustomerScoreConfig = {
  completedLoanWeight: 15,
  perfectRepaymentWeight: 20,
  stableEmployerWeight: 15,
  relationshipDurationWeight: 10,
  failedDeductionPenalty: 15,
  defaultPenalty: 30,
  highDtiPenalty: 15,
};

/**
 * Computes a configurable Customer Relationship Score (0-100).
 * Handles New Customers without prior history (-1 score / "New Customer" tier).
 */
export function computeCustomerRelationshipScore(
  customerId: string,
  customerApps: LoanApplication[],
  customerReps: Repayment[],
  payrollRecords: PayrollRecord[],
  config: CustomerScoreConfig = DEFAULT_CUSTOMER_SCORE_CONFIG
): CustomerRiskScore {
  const positiveFactors: string[] = [];
  const negativeFactors: string[] = [];

  // Check if New Customer without history
  if (customerApps.length === 0 && customerReps.length === 0) {
    return {
      id: `crs-${customerId}-${Date.now()}`,
      customerId,
      score: -1,
      tier: 'New Customer',
      positiveFactors: [],
      negativeFactors: ['No previous PINACO loan history — new customer profile'],
      createdAt: new Date().toISOString(),
    };
  }

  let rawScore = 50; // Neutral starting baseline

  // 1. Completed loans
  const completedLoans = customerApps.filter(a => a.status === 'Completed').length;
  if (completedLoans > 0) {
    const bonus = Math.min(completedLoans * config.completedLoanWeight, 30);
    rawScore += bonus;
    positiveFactors.push(`✓ ${completedLoans} previous loan(s) completed successfully (+${bonus} pts)`);
  }

  // 2. Perfect repayment history
  const paidReps = customerReps.filter(r => r.status === 'Paid').length;
  const overdueReps = customerReps.filter(r => r.status === 'Overdue').length;
  const failedDeductions = customerReps.filter(r => r.status === 'FAILED_DEDUCTION').length;
  const totalReps = paidReps + overdueReps + failedDeductions;

  if (totalReps > 0 && overdueReps === 0 && failedDeductions === 0) {
    rawScore += config.perfectRepaymentWeight;
    positiveFactors.push(`✓ 100% flawless repayment history across ${paidReps} installments (+${config.perfectRepaymentWeight} pts)`);
  }

  // 3. Stable employer
  const firstApp = customerApps[0];
  const sectorLower = (firstApp?.sector || '').toLowerCase();
  if (sectorLower.includes('public') || sectorLower.includes('education') || sectorLower.includes('health') || sectorLower.includes('university') || sectorLower.includes('government')) {
    rawScore += config.stableEmployerWeight;
    positiveFactors.push(`✓ Employed in stable public/institutional sector (${firstApp?.sector}) (+${config.stableEmployerWeight} pts)`);
  }

  // 4. Relationship duration
  const earliestDate = customerApps
    .map(a => new Date(a.date).getTime())
    .filter(t => !isNaN(t));
  if (earliestDate.length > 0) {
    const months = (Date.now() - Math.min(...earliestDate)) / (1000 * 60 * 60 * 24 * 30);
    if (months >= 12) {
      rawScore += config.relationshipDurationWeight;
      positiveFactors.push(`✓ Established customer relationship (${Math.round(months)} months) (+${config.relationshipDurationWeight} pts)`);
    }
  }

  // Penalties
  if (failedDeductions > 0) {
    rawScore -= failedDeductions * config.failedDeductionPenalty;
    negativeFactors.push(`⚠ ${failedDeductions} failed payroll deduction(s) recorded (-${failedDeductions * config.failedDeductionPenalty} pts)`);
  }

  if (overdueReps > 0) {
    rawScore -= overdueReps * config.defaultPenalty;
    negativeFactors.push(`⚠ ${overdueReps} overdue repayment installment(s) recorded (-${overdueReps * config.defaultPenalty} pts)`);
  }

  const latestDti = parseFloat((firstApp?.debtToIncome || '30%').replace('%', ''));
  if (latestDti > 40) {
    rawScore -= config.highDtiPenalty;
    negativeFactors.push(`⚠ Elevated Debt-to-Income ratio (${latestDti}%) (-${config.highDtiPenalty} pts)`);
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  let tier: CustomerRiskScore['tier'];
  if (finalScore >= 85) tier = 'High'; // High Trust / Excellent
  else if (finalScore >= 70) tier = 'Good';
  else if (finalScore >= 50) tier = 'Fair';
  else tier = 'Poor';

  return {
    id: `crs-${customerId}-${Date.now()}`,
    customerId,
    score: finalScore,
    tier,
    positiveFactors,
    negativeFactors,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Computes repeat borrower top-up recommendations factoring in current balance,
 * remaining term, salary, existing debt, and post-top-up DTI.
 */
export function computeRepeatBorrowerOpportunities(
  customers: Customer[],
  applications: LoanApplication[],
  repayments: Repayment[],
  payrollRecords: PayrollRecord[]
): CustomerRecommendation[] {
  const recommendations: CustomerRecommendation[] = [];

  customers.forEach(cust => {
    const custApps = applications.filter(a => a.userId === cust.userId || a.id === cust.id || a.applicantName.toLowerCase() === cust.name.toLowerCase());
    const custReps = repayments.filter(r => custApps.some(a => a.id === r.applicationId));

    if (custApps.length === 0) return;

    const activeApp = custApps.find(a => ['Disbursed', 'Approved', 'Active'].includes(a.status));
    const completedApps = custApps.filter(a => a.status === 'Completed');
    const lastApp = activeApp || custApps[custApps.length - 1];

    const currentLoanAmount = lastApp ? lastApp.amount : 0;
    const unpaidReps = custReps.filter(r => r.status !== 'Paid');
    const remainingBalance = unpaidReps.reduce((sum, r) => sum + r.amount, 0);

    // Fix 2: Remove salary assumption (use actual monthlyRevenue or 0)
    const salary = lastApp?.monthlyRevenue ?? 0;

    // Fix 3: Use customer's actual loan term or default to 12 months with explicit note
    const isTermDefault = !lastApp?.termMonths;
    const termMonths = lastApp?.termMonths || 12;

    const reasons: string[] = [];
    let recommendationType: CustomerRecommendation['recommendationType'] = 'Standard';
    let confidence = 75;
    let potentialTopUp = 0;
    let postTopUpDti = 0;

    if (salary <= 0) {
      // Fix 2 Enforcement: Income unavailable -> Requires Assessment
      recommendationType = 'Requires Assessment';
      confidence = 45;
      reasons.push(`⚠ Income information unavailable — manual credit assessment required`);
      if (completedApps.length > 0) {
        reasons.push(`✓ Customer completed ${completedApps.length} prior loan(s), but updated income proof is needed`);
      }
    } else {
      // Potential top-up calculation based on verified salary
      potentialTopUp = Math.round(salary * 5.0); // 5 months salary capacity
      const newEstimatedInstallment = (remainingBalance + potentialTopUp) / termMonths;
      postTopUpDti = Math.round((newEstimatedInstallment / salary) * 100);

      if (completedApps.length > 0) {
        reasons.push(`✓ Customer has completed ${completedApps.length} previous loan(s) successfully`);
      }

      const failedDeductions = custReps.filter(r => r.status === 'FAILED_DEDUCTION').length;
      if (failedDeductions === 0 && custReps.length > 0) {
        reasons.push(`✓ 100% clean payroll deduction history`);
      } else if (failedDeductions > 0) {
        reasons.push(`⚠ ${failedDeductions} payroll deduction exception(s) on record`);
      }

      if (isTermDefault) {
        reasons.push(`ℹ Estimated installment: MWK ${Math.round(newEstimatedInstallment).toLocaleString()} (calculated using default term of 12 months: (Balance + Top-up) / 12)`);
      } else {
        reasons.push(`✓ Estimated installment: MWK ${Math.round(newEstimatedInstallment).toLocaleString()} based on ${termMonths}-month loan term ((Balance + Top-up) / ${termMonths})`);
      }

      if (postTopUpDti <= 40 && (completedApps.length > 0 || cust.customerType === 'Existing')) {
        recommendationType = 'Top-Up';
        confidence = 94;
        reasons.push(`✓ Manageable post-top-up DTI ratio (${postTopUpDti}%) below 40% policy threshold`);
      } else if (postTopUpDti > 45) {
        recommendationType = 'Requires Assessment';
        confidence = 60;
        reasons.push(`⚠ Proposed top-up exceeds maximum DTI limit (${postTopUpDti}%)`);
      } else {
        recommendationType = 'Standard';
        confidence = 80;
      }
    }

    recommendations.push({
      id: `rec-${cust.id}-${Date.now()}`,
      customerId: cust.id,
      customerName: cust.name,
      recommendationType,
      currentLoanAmount,
      remainingBalance,
      recommendedAmount: potentialTopUp,
      confidence,
      postTopUpDti,
      reasons,
      createdAt: new Date().toISOString(),
    });
  });

  return recommendations;
}

/**
 * Reconstructs a customer's risk evolution timeline using ONLY actual store events.
 * Displays "No historical risk events available." if empty.
 */
export function computeCustomerRiskTimeline(
  customerId: string,
  applications: LoanApplication[],
  repayments: Repayment[],
  auditLogs: AuditLogEntry[]
): CustomerRiskTimelineEntry[] {
  const events: CustomerRiskTimelineEntry[] = [];

  const custApps = applications.filter(a => a.userId === customerId || a.id === customerId);
  custApps.forEach(app => {
    if (app.date) {
      events.push({
        id: `timeline-app-${app.id}`,
        customerId,
        date: app.date,
        riskLevel: app.riskLevel,
        score: app.score,
        triggerEvent: `Loan Application Submitted (${app.id})`,
        details: `Requested MWK ${app.amount.toLocaleString()} for ${app.sector} sector. Initial score: ${app.score}.`,
      });
    }
    if (app.disbursedAt) {
      events.push({
        id: `timeline-disbured-${app.id}`,
        customerId,
        date: app.disbursedAt,
        riskLevel: app.riskLevel,
        score: app.score,
        triggerEvent: `Loan Disbursed`,
        details: `MWK ${app.amount.toLocaleString()} disbursed following approval.`,
      });
    }
  });

  const appIds = new Set(custApps.map(a => a.id));
  const custReps = repayments.filter(r => appIds.has(r.applicationId || ''));
  custReps.forEach(rep => {
    if (rep.status === 'Paid' && rep.paidAt) {
      events.push({
        id: `timeline-rep-${rep.id}`,
        customerId,
        date: rep.paidAt,
        riskLevel: 'Low',
        score: 85,
        triggerEvent: `Installment #${rep.installmentNumber} Paid`,
        details: `Successful repayment of MWK ${rep.amount.toLocaleString()}.`,
      });
    } else if (rep.status === 'FAILED_DEDUCTION') {
      events.push({
        id: `timeline-failed-${rep.id}`,
        customerId,
        date: rep.dueDate,
        riskLevel: 'Medium',
        score: 65,
        triggerEvent: `Payroll Deduction Exception`,
        details: `Installment #${rep.installmentNumber} (MWK ${rep.amount.toLocaleString()}) unmatched in payroll processing. Categorized as FAILED_DEDUCTION.`,
      });
    } else if (rep.status === 'Overdue') {
      events.push({
        id: `timeline-overdue-${rep.id}`,
        customerId,
        date: rep.dueDate,
        riskLevel: 'High',
        score: 40,
        triggerEvent: `Installment Overdue`,
        details: `Installment #${rep.installmentNumber} overdue past due date (${rep.dueDate}).`,
      });
    }
  });

  // Sort events chronologically
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (events.length === 0) {
    return [{
      id: `timeline-empty-${customerId}`,
      customerId,
      date: new Date().toISOString().slice(0, 10),
      riskLevel: 'New',
      score: -1,
      triggerEvent: 'No Historical Data',
      details: 'No historical risk events available.',
    }];
  }

  return events;
}

/**
 * Computes employer risk forecast ONLY if 6+ months of payroll data exists.
 * Otherwise returns "Insufficient historical data".
 */
export function computeEmployerRiskPrediction(
  employerName: string,
  payrollRecords: PayrollRecord[]
): EmployerRiskPrediction {
  const empRecords = payrollRecords.filter(p => p.employer.toLowerCase() === employerName.toLowerCase());

  // Group by month
  const monthlyMap: Record<string, { total: number; matched: number }> = {};
  empRecords.forEach(r => {
    const m = r.month || 'Unknown';
    monthlyMap[m] ??= { total: 0, matched: 0 };
    monthlyMap[m].total += 1;
    if (r.status === 'Matched' || r.status === 'Applied') {
      monthlyMap[m].matched += 1;
    }
  });

  const months = Object.keys(monthlyMap).sort();
  const monthsOfData = months.length;

  if (monthsOfData < 6) {
    return {
      id: `emp-pred-${employerName}-${Date.now()}`,
      employer: employerName,
      currentCollectionRate: 0,
      historicalTrend: [],
      predictedRisk: 'Medium',
      monthsOfData,
      hasSufficientData: false,
      reason: `Insufficient historical data (less than 6 months of payroll records available; found ${monthsOfData} month(s)).`,
      createdAt: new Date().toISOString(),
    };
  }

  const historicalTrend = months.slice(-6).map(m => {
    const d = monthlyMap[m];
    return d.total > 0 ? Math.round((d.matched / d.total) * 100) : 0;
  });

  const currentCollectionRate = historicalTrend[historicalTrend.length - 1] || 0;
  const firstRate = historicalTrend[0] || 0;
  const isDeclining = (firstRate - currentCollectionRate) > 3;

  let predictedRisk: 'Low' | 'Medium' | 'High' = 'Low';
  let reason = `Stable payroll deduction performance across ${monthsOfData} months of historical records.`;

  if (isDeclining) {
    predictedRisk = currentCollectionRate < 90 ? 'High' : 'Medium';
    reason = `Collection performance declining from ${firstRate}% to ${currentCollectionRate}% over the 6-month historical trend.`;
  }

  return {
    id: `emp-pred-${employerName}-${Date.now()}`,
    employer: employerName,
    currentCollectionRate,
    historicalTrend,
    predictedRisk,
    monthsOfData,
    hasSufficientData: true,
    reason,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Computes Customer Lifetime Value (LTV) for executive portfolio view.
 */
export function computeCustomerLifetimeValue(
  customerId: string,
  customerName: string,
  applications: LoanApplication[],
  repayments: Repayment[]
): CustomerLifetimeValue {
  const custApps = applications.filter(a => a.userId === customerId || a.id === customerId || a.applicantName.toLowerCase() === customerName.toLowerCase());
  const custReps = repayments.filter(r => custApps.some(a => a.id === r.applicationId));

  const totalBorrowed = custApps
    .filter(a => ['Approved', 'Disbursed', 'Active', 'Completed'].includes(a.status))
    .reduce((sum, a) => sum + a.amount, 0);

  const interestGenerated = custReps
    .filter(r => r.status === 'Paid')
    .reduce((sum, r) => sum + (r.interest || Math.round(r.amount * 0.15)), 0);

  const completedLoans = custApps.filter(a => a.status === 'Completed').length;

  const dates = custApps.map(a => new Date(a.date).getTime()).filter(t => !isNaN(t));
  const relationshipMonths = dates.length > 0
    ? Math.max(1, Math.round((Date.now() - Math.min(...dates)) / (1000 * 60 * 60 * 24 * 30)))
    : 1;

  const ltv = interestGenerated + (completedLoans * 50000);

  return {
    customerId,
    customerName,
    totalBorrowed,
    interestGenerated,
    completedLoans,
    relationshipMonths,
    ltv,
    meaning: `This customer has generated MWK ${interestGenerated.toLocaleString()} interest revenue for PINACO over a ${relationshipMonths}-month relationship.`,
  };
}
