import { one, type Queryable, pool } from '../../db/pool';
import { quoteLoan, round2 } from '../../lib/loanMath';
import { getSetting, type AssessmentThresholds } from '../settings/settings';
import type { ProductRow } from '../products/products.service';
import { documentRequirements } from './requirements';

/**
 * Explainable affordability assessment. It calculates ratios from figures whose
 * provenance is always shown, flags indicators against the institution's thresholds,
 * and lists what is missing. It NEVER approves or rejects: that is a human decision.
 */

export type Provenance = 'verified' | 'applicant' | 'estimated' | 'missing';

export interface Figure {
  value: number | null;
  source: Provenance;
  note?: string;
}

export interface Indicator {
  code: string;
  severity: 'info' | 'caution' | 'concern';
  message: string;
}

export interface AssessmentOutput {
  inputs: Record<string, Figure>;
  results: Record<string, number | null>;
  scenarios: Array<{ termMonths: number; installment: number; ratio: number | null; ratioLabel: string }>;
  indicators: Indicator[];
  missingInformation: string[];
  thresholdsConfirmed: boolean;
}

export interface OfficerOverride {
  value: number;
  note: string;
  evidenceDocumentId?: string;
}

interface AppForAssessment {
  id: string;
  customer_id: string | null;
  business_id: string | null;
  borrower_type: 'individual' | 'business';
  amount: number;
  term_months: number;
  applicant_declared: Record<string, any>;
  required_documents: string[];
}

function figure(value: unknown, source: Provenance, note?: string): Figure {
  const numeric = value === null || value === undefined || value === '' ? null : Number(value);
  return numeric === null || !Number.isFinite(numeric) ? { value: null, source: 'missing', note } : { value: numeric, source, note };
}

function monthsSince(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const from = new Date(`${isoDate}T00:00:00Z`);
  const now = new Date();
  return Math.max(0, (now.getUTCFullYear() - from.getUTCFullYear()) * 12 + now.getUTCMonth() - from.getUTCMonth());
}

function installmentFor(product: ProductRow, amount: number, termMonths: number): number | null {
  if (product.interest_rate_monthly === null) return null;
  const quote = quoteLoan({
    principal: amount, termMonths, monthlyRatePct: product.interest_rate_monthly, interestMethod: product.interest_method,
    repaymentFrequency: product.repayment_frequency, startDate: new Date().toISOString().slice(0, 10),
  });
  // For bullet loans express the burden as a monthly equivalent so ratios stay comparable.
  return product.repayment_frequency === 'bullet' ? round2(quote.totalRepayable / termMonths) : quote.installmentAmount;
}

export async function runAssessment(
  app: AppForAssessment,
  product: ProductRow,
  overrides: Record<string, OfficerOverride> = {},
  client: Queryable = pool,
): Promise<AssessmentOutput> {
  const thresholds = await getSetting<AssessmentThresholds>('assessment_thresholds', client);
  const declared = app.applicant_declared || {};
  const inputs: Record<string, Figure> = {};
  const indicators: Indicator[] = [];
  const missing: string[] = [];
  const results: Record<string, number | null> = {};
  const apply = (key: string, base: Figure) => {
    const override = overrides[key];
    inputs[key] = override ? { value: override.value, source: 'verified', note: override.note } : base;
  };

  const installment = installmentFor(product, app.amount, app.term_months);
  inputs.proposedInstallment = installment === null
    ? { value: null, source: 'missing', note: 'Product has no approved rate.' }
    : { value: installment, source: 'estimated', note: product.repayment_frequency === 'bullet' ? 'Monthly equivalent of a single repayment at maturity.' : 'Calculated from the product rate.' };
  if (installment === null) missing.push('The product has no approved interest rate, so repayments cannot be calculated.');

  if (app.borrower_type === 'individual') {
    apply('monthlyNetIncome', figure(declared.monthlyNetIncome, 'applicant'));
    apply('existingMonthlyDeductions', figure(declared.existingMonthlyDeductions ?? 0, 'applicant'));
    const income = inputs.monthlyNetIncome.value;
    const existing = inputs.existingMonthlyDeductions.value ?? 0;
    results.debtServiceRatio = income && installment !== null ? round2((existing + installment) / income) : null;
    results.disposableIncomeAfterLoan = income !== null && installment !== null ? round2(income - existing - installment) : null;

    if (income === null) missing.push('Monthly net income has not been provided.');
    if (inputs.monthlyNetIncome.source !== 'verified') missing.push('Net income is applicant-declared; verify it against a payslip or bank statement.');
    if (results.debtServiceRatio !== null && results.debtServiceRatio > thresholds.maxIndividualDebtServiceRatio) {
      indicators.push({ code: 'dsr_above_threshold', severity: 'concern', message: `Repayments would take ${(results.debtServiceRatio * 100).toFixed(0)}% of net income (threshold ${(thresholds.maxIndividualDebtServiceRatio * 100).toFixed(0)}%).` });
    }
    if (results.disposableIncomeAfterLoan !== null && results.disposableIncomeAfterLoan < 0) {
      indicators.push({ code: 'negative_disposable_income', severity: 'concern', message: 'Declared income does not cover existing deductions plus the new installment.' });
    }
  } else {
    const verified = app.business_id ? await one(
      `SELECT * FROM business_financials WHERE business_id = $1 AND source = 'verified' ORDER BY period_end DESC, created_at DESC LIMIT 1`, [app.business_id], client,
    ) : null;
    const declaredFin = app.business_id ? await one(
      `SELECT * FROM business_financials WHERE business_id = $1 AND source = 'applicant' ORDER BY period_end DESC, created_at DESC LIMIT 1`, [app.business_id], client,
    ) : null;
    const fin = verified ?? declaredFin;
    const source: Provenance = verified ? 'verified' : declaredFin ? 'applicant' : 'missing';
    const period = fin ? `Average for ${fin.period_start} to ${fin.period_end}.` : undefined;
    apply('avgMonthlyRevenue', figure(fin?.avg_monthly_revenue, source, period));
    apply('avgMonthlyCostOfSales', figure(fin?.avg_monthly_cost_of_sales, source, period));
    apply('avgMonthlyOperatingExpenses', figure(fin?.avg_monthly_operating_expenses, source, period));
    apply('existingMonthlyDebtService', figure(fin?.existing_monthly_debt_service, source, period));
    apply('largestCustomerShare', figure(fin?.largest_customer_share, source, period));

    if (!fin) missing.push('No business financial information has been recorded.');
    else if (!verified) missing.push('Business figures are applicant-declared; record verified figures from bank statements or accounts.');

    const revenue = inputs.avgMonthlyRevenue.value;
    const netOperating = revenue === null ? null
      : round2(revenue - (inputs.avgMonthlyCostOfSales.value ?? 0) - (inputs.avgMonthlyOperatingExpenses.value ?? 0));
    const debt = (inputs.existingMonthlyDebtService.value ?? 0) + (installment ?? 0);
    results.netOperatingCashFlow = netOperating;
    results.debtServiceCoverage = netOperating !== null && installment !== null && debt > 0 ? round2(netOperating / debt) : null;
    results.installmentToRevenue = revenue && installment !== null ? round2(installment / revenue) : null;

    if (results.debtServiceCoverage !== null && results.debtServiceCoverage < thresholds.minBusinessDebtServiceCoverage) {
      indicators.push({ code: 'dscr_below_threshold', severity: 'concern', message: `Cash flow covers debt service ${results.debtServiceCoverage.toFixed(2)}× (threshold ${thresholds.minBusinessDebtServiceCoverage}×).` });
    }
    if (netOperating !== null && netOperating <= 0) {
      indicators.push({ code: 'negative_cash_flow', severity: 'concern', message: 'Recorded expenses equal or exceed revenue.' });
    }
    if (results.installmentToRevenue !== null && results.installmentToRevenue > thresholds.maxInstallmentToRevenueRatio) {
      indicators.push({ code: 'installment_to_revenue', severity: 'caution', message: `The installment is ${(results.installmentToRevenue * 100).toFixed(0)}% of monthly revenue (threshold ${(thresholds.maxInstallmentToRevenueRatio * 100).toFixed(0)}%).` });
    }
    const share = inputs.largestCustomerShare.value;
    if (share !== null && share > thresholds.maxSingleCustomerConcentration) {
      indicators.push({ code: 'customer_concentration', severity: 'caution', message: `${(share * 100).toFixed(0)}% of revenue comes from one customer.` });
    }

    const business = app.business_id ? await one('SELECT date_established, verification_status FROM businesses WHERE id = $1', [app.business_id], client) : null;
    const trading = monthsSince(business?.date_established ?? null);
    results.monthsTrading = trading;
    if (trading === null) missing.push('Business start date is not recorded.');
    else if (trading < thresholds.minMonthsTrading) {
      indicators.push({ code: 'short_trading_history', severity: 'caution', message: `Trading for ${trading} month(s) (threshold ${thresholds.minMonthsTrading}).` });
    }
    if (business && business.verification_status !== 'verified') missing.push('The business profile has not been verified.');

    if (product.category === 'invoice_discounting' || product.category === 'order_financing') {
      apply('expectedProceeds', figure(declared.expectedProceeds, 'applicant', product.category === 'invoice_discounting' ? 'Invoice value' : 'Order value'));
      const proceeds = inputs.expectedProceeds.value;
      if (proceeds === null) missing.push(`The ${product.category === 'invoice_discounting' ? 'invoice' : 'order'} value has not been provided.`);
      else if (installment !== null) {
        const totalRepayable = installment * app.term_months;
        results.proceedsCoverage = round2(proceeds / totalRepayable);
        if (results.proceedsCoverage < 1) {
          indicators.push({ code: 'proceeds_below_repayment', severity: 'concern', message: 'The expected proceeds are less than the total repayable.' });
        }
      }
    }
  }

  // Document position (verified vs applicant-provided).
  const requirements = await documentRequirements(app, client);
  for (const requirement of requirements.filter(item => item.status !== 'verified')) {
    missing.push(`${requirement.label}: ${requirement.status.replace('_', ' ')}.`);
  }
  if (product.collateral_required) {
    const collateral = requirements.find(item => item.code === 'collateral_document' || item.code === 'asset_quotation');
    if (!collateral || collateral.status !== 'verified') indicators.push({ code: 'collateral_unverified', severity: 'caution', message: 'Security for this product has not been verified.' });
  }

  // Affordability under alternative terms.
  const scenarios: AssessmentOutput['scenarios'] = [];
  const terms = [...new Set([product.min_term_months, app.term_months, product.max_term_months].filter((term): term is number => typeof term === 'number'))].sort((a, b) => a - b);
  for (const termMonths of terms) {
    const scenarioInstallment = installmentFor(product, app.amount, termMonths);
    if (scenarioInstallment === null) continue;
    let ratio: number | null = null;
    let ratioLabel = '';
    if (app.borrower_type === 'individual') {
      const income = inputs.monthlyNetIncome?.value;
      ratio = income ? round2(((inputs.existingMonthlyDeductions?.value ?? 0) + scenarioInstallment) / income) : null;
      ratioLabel = 'Debt service ratio';
    } else {
      const net = results.netOperatingCashFlow;
      const debt = (inputs.existingMonthlyDebtService?.value ?? 0) + scenarioInstallment;
      ratio = net !== null && net !== undefined && debt > 0 ? round2(net / debt) : null;
      ratioLabel = 'Debt service coverage';
    }
    scenarios.push({ termMonths, installment: scenarioInstallment, ratio, ratioLabel });
  }

  if (!thresholds.confirmedByInstitution) {
    indicators.push({ code: 'thresholds_unconfirmed', severity: 'info', message: 'Assessment thresholds are placeholders until confirmed by the institution’s credit policy.' });
  }

  return { inputs, results, scenarios, indicators, missingInformation: missing, thresholdsConfirmed: thresholds.confirmedByInstitution };
}
