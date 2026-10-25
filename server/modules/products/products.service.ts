import { many, one, type Queryable, pool } from '../../db/pool';
import type { ProductFee } from '../../lib/loanMath';

export interface ProductRow {
  id: string;
  code: string;
  name: string;
  category: string;
  borrower_type: 'individual' | 'business';
  description: string;
  min_amount: number | null;
  max_amount: number | null;
  min_term_months: number | null;
  max_term_months: number | null;
  interest_method: 'flat' | 'reducing_balance';
  interest_rate_monthly: number | null;
  repayment_frequency: 'monthly' | 'bullet';
  fees: ProductFee[];
  required_documents: string[];
  eligibility: Record<string, unknown>;
  members_only: boolean;
  collateral_required: boolean;
  collateral_notes: string | null;
  status: 'draft' | 'active' | 'suspended' | 'retired';
  terms_confirmed: boolean;
  effective_from: string | null;
  effective_to: string | null;
  updated_at: Date;
  data_source: string;
}

export function presentProduct(row: ProductRow, options: { includeAdmin?: boolean } = {}) {
  const base = {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    borrowerType: row.borrower_type,
    description: row.description,
    minAmount: row.min_amount,
    maxAmount: row.max_amount,
    minTermMonths: row.min_term_months,
    maxTermMonths: row.max_term_months,
    interestMethod: row.interest_method,
    interestRateMonthly: row.interest_rate_monthly,
    repaymentFrequency: row.repayment_frequency,
    fees: row.fees,
    requiredDocuments: row.required_documents,
    membersOnly: row.members_only,
    collateralRequired: row.collateral_required,
    collateralNotes: row.collateral_notes,
    status: row.status,
    isAvailable: isAvailable(row),
  };
  if (!options.includeAdmin) return base;
  return {
    ...base,
    termsConfirmed: row.terms_confirmed,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    eligibility: row.eligibility,
    updatedAt: row.updated_at,
    isDemo: row.data_source !== 'live',
    activationBlockers: activationBlockers(row),
  };
}

export async function getProduct(id: string, client: Queryable = pool): Promise<ProductRow | null> {
  return one<ProductRow>('SELECT * FROM loan_products WHERE id = $1', [id], client);
}

export async function listProducts(filter: { onlyAvailable?: boolean } = {}): Promise<ProductRow[]> {
  const rows = await many<ProductRow>('SELECT * FROM loan_products ORDER BY borrower_type DESC, name');
  return filter.onlyAvailable ? rows.filter(row => isAvailable(row)) : rows;
}

export function isAvailable(row: ProductRow, today = new Date().toISOString().slice(0, 10)): boolean {
  if (row.status !== 'active' || !row.terms_confirmed) return false;
  if (row.effective_from && row.effective_from > today) return false;
  if (row.effective_to && row.effective_to < today) return false;
  return true;
}

/** Everything that must be true before a product can be offered to customers. */
export function activationBlockers(row: Pick<ProductRow,
  'min_amount' | 'max_amount' | 'min_term_months' | 'max_term_months' | 'interest_rate_monthly' | 'terms_confirmed' | 'repayment_frequency'>): string[] {
  const blockers: string[] = [];
  if (row.min_amount === null || row.max_amount === null) blockers.push('Set the minimum and maximum amount.');
  if (row.min_term_months === null || row.max_term_months === null) blockers.push('Set the minimum and maximum term.');
  if (row.interest_rate_monthly === null) blockers.push('Set the approved interest rate.');
  if (!row.terms_confirmed) blockers.push('Confirm that the terms have been approved by the institution.');
  return blockers;
}

/** Checks a requested amount and term against the product. Returns problems as field errors. */
export function validateAgainstProduct(product: ProductRow, amount: number, termMonths: number): Array<{ field: string; message: string }> {
  const problems: Array<{ field: string; message: string }> = [];
  const money = (value: number) => `MWK ${value.toLocaleString('en-US')}`;
  if (product.min_amount !== null && amount < product.min_amount) problems.push({ field: 'amount', message: `The minimum for ${product.name} is ${money(product.min_amount)}.` });
  if (product.max_amount !== null && amount > product.max_amount) problems.push({ field: 'amount', message: `The maximum for ${product.name} is ${money(product.max_amount)}.` });
  if (product.min_term_months !== null && termMonths < product.min_term_months) problems.push({ field: 'termMonths', message: `The shortest term is ${product.min_term_months} months.` });
  if (product.max_term_months !== null && termMonths > product.max_term_months) problems.push({ field: 'termMonths', message: `The longest term is ${product.max_term_months} months.` });
  if (!Number.isInteger(termMonths)) problems.push({ field: 'termMonths', message: 'Use a whole number of months.' });
  return problems;
}
