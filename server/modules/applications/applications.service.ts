import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { many, one, type Queryable, pool } from '../../db/pool';
import { conflict, notFound } from '../../lib/http';
import { round2 } from '../../lib/loanMath';
import { loadProductAccess } from '../../auth/permissions';
import { getSetting, type WorkflowSettings } from '../settings/settings';

export const STATUSES = [
  'draft', 'submitted', 'under_review', 'info_requested', 'assessed', 'recommended',
  'approved', 'rejected', 'offer_issued', 'offer_accepted', 'offer_declined', 'disbursed', 'closed', 'withdrawn',
] as const;
export type Status = typeof STATUSES[number];

export const PRE_DECISION: Status[] = ['submitted', 'under_review', 'info_requested', 'assessed', 'recommended'];
export const APPLICANT_EDITABLE: Status[] = ['draft', 'info_requested'];

export interface ApplicationRow {
  id: string;
  reference: string;
  status: Status;
  borrower_type: 'individual' | 'business';
  customer_id: string;
  business_id: string | null;
  product_id: string;
  user_id: string | null;
  applicant_name: string;
  amount: number;
  term_months: number;
  purpose: string | null;
  applicant_declared: Record<string, any>;
  interest_rate: number | null;
  interest_method: string | null;
  product_snapshot: Record<string, any> | null;
  assigned_officer_id: string | null;
  assigned_at: Date | null;
  submitted_at: Date | null;
  info_request_note: string | null;
  recommendation: 'approve' | 'decline' | null;
  recommendation_note: string | null;
  recommended_by: string | null;
  recommended_at: Date | null;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
  approved_amount: number | null;
  approved_term_months: number | null;
  disbursed_at: Date | null;
  closed_at: Date | null;
  withdrawn_at: Date | null;
  created_at: Date;
  updated_at: Date;
  data_source: string;
  required_documents: string[];
}

export async function loadApplication(id: string, client: Queryable = pool, lock = false): Promise<ApplicationRow> {
  const row = await one<ApplicationRow>(
    `SELECT a.*,
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(a.product_snapshot->'required_documents')), p.required_documents) AS required_documents
       FROM loan_applications a JOIN loan_products p ON p.id = a.product_id
      WHERE a.id = $1 ${lock ? 'FOR UPDATE OF a' : ''}`,
    [id],
    client,
  );
  if (!row) throw notFound('Application not found.');
  return row;
}

/** Moves an application to a new status, guarding against concurrent changes, and records the event. */
export async function transition(
  client: PoolClient,
  app: Pick<ApplicationRow, 'id' | 'status'>,
  to: Status,
  req: Request,
  note: string | null,
  extraSql = '',
  extraParams: unknown[] = [],
): Promise<void> {
  const result = await client.query(
    `UPDATE loan_applications SET status = $2, updated_at = now() ${extraSql ? `, ${extraSql}` : ''}
      WHERE id = $1 AND status = $3`,
    [app.id, to, app.status, ...extraParams],
  );
  if (!result.rowCount) throw conflict('This application was changed by someone else. Refresh and try again.');
  await client.query(
    `INSERT INTO application_events (application_id, from_status, to_status, actor_id, actor_role, note) VALUES ($1, $2, $3, $4, $5, $6)`,
    [app.id, app.status, to, req.auth!.userId, req.auth!.role, note],
  );
}

export async function nextReference(client: Queryable): Promise<string> {
  const row = await one<{ n: number }>(`SELECT nextval('loan_application_reference_seq')::int AS n`, [], client);
  return `PFS-${new Date().getUTCFullYear()}-${String(row!.n).padStart(6, '0')}`;
}

export function productSnapshot(product: any) {
  return {
    name: product.name,
    code: product.code,
    category: product.category,
    interest_method: product.interest_method,
    interest_rate_monthly: product.interest_rate_monthly,
    repayment_frequency: product.repayment_frequency,
    fees: product.fees,
    required_documents: product.required_documents,
    min_amount: product.min_amount,
    max_amount: product.max_amount,
    min_term_months: product.min_term_months,
    max_term_months: product.max_term_months,
    members_only: product.members_only,
    collateral_required: product.collateral_required,
    captured_at: new Date().toISOString(),
  };
}

// ── Loan position ────────────────────────────────────────────────────────────

export interface LoanPosition {
  outstandingPrincipal: number;
  outstandingTotal: number;
  paidTotal: number;
  arrearsAmount: number;
  daysPastDue: number;
  nextDue: { date: string; amount: number } | null;
  installmentsPaid: number;
  installmentsTotal: number;
}

export async function loanPosition(applicationId: string, client: Queryable = pool): Promise<LoanPosition | null> {
  const rows = await many<{ installment_number: number; due_date: string; principal_due: number; total_due: number; amount_paid: number }>(
    'SELECT installment_number, due_date, principal_due, total_due, amount_paid FROM loan_installments WHERE application_id = $1 ORDER BY installment_number',
    [applicationId],
    client,
  );
  if (!rows.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  let arrears = 0;
  let oldestUnpaidPastDue: string | null = null;
  let outstandingTotal = 0;
  let paid = 0;
  let paidPrincipalCovered = 0;
  let next: LoanPosition['nextDue'] = null;
  let installmentsPaid = 0;
  for (const row of rows) {
    const remaining = round2(row.total_due - row.amount_paid);
    paid += row.amount_paid;
    outstandingTotal += remaining;
    // Payments cover interest first within an installment, then principal.
    const interestPart = row.total_due - row.principal_due;
    paidPrincipalCovered += Math.max(0, Math.min(row.principal_due, row.amount_paid - interestPart));
    if (remaining <= 0.009) { installmentsPaid += 1; continue; }
    if (row.due_date < today) {
      arrears += remaining;
      oldestUnpaidPastDue ??= row.due_date;
    } else if (!next) {
      next = { date: row.due_date, amount: remaining };
    }
  }
  const principalTotal = rows.reduce((sum, row) => sum + row.principal_due, 0);
  const daysPastDue = oldestUnpaidPastDue
    ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldestUnpaidPastDue}T00:00:00Z`)) / 86_400_000)
    : 0;
  return {
    outstandingPrincipal: round2(principalTotal - paidPrincipalCovered),
    outstandingTotal: round2(outstandingTotal),
    paidTotal: round2(paid),
    arrearsAmount: round2(arrears),
    daysPastDue,
    nextDue: next,
    installmentsPaid,
    installmentsTotal: rows.length,
  };
}

// ── What the current user may do ─────────────────────────────────────────────

export async function allowedActions(req: Request, app: ApplicationRow): Promise<string[]> {
  const auth = req.auth!;
  const actions: string[] = [];
  if (auth.role === 'customer') {
    if (APPLICANT_EDITABLE.includes(app.status)) actions.push('edit', 'submit', 'upload_documents');
    if (['draft', ...PRE_DECISION, 'approved'].includes(app.status)) actions.push('withdraw');
    if (app.status === 'offer_issued') actions.push('respond_offer');
    return actions;
  }
  const workflow = await getSetting<WorkflowSettings>('workflow');
  const products = await loadProductAccess(req);
  const productOk = products === 'all' || products.has(app.product_id);
  const isAssignee = app.assigned_officer_id === auth.userId;
  const can = (permission: string) => auth.permissions.has(permission as never);

  if (can('applications.assign') && productOk && PRE_DECISION.includes(app.status)) actions.push('assign');
  if (isAssignee && can('applications.request_info') && ['under_review', 'assessed', 'recommended'].includes(app.status)) actions.push('request_info');
  if (isAssignee && can('applications.assess') && ['under_review', 'assessed'].includes(app.status)) actions.push('assess');
  if (isAssignee && can('applications.recommend') && app.status === 'assessed') actions.push('recommend');
  if (can('applications.approve') && productOk && app.status === 'recommended') {
    const separated = !workflow.requireSeparationOfDuties || (app.recommended_by !== auth.userId && !isAssignee);
    const limitOk = auth.role === 'admin' ? (auth.approvalLimit === null || auth.approvalLimit >= app.amount) : (auth.approvalLimit !== null && auth.approvalLimit >= app.amount);
    if (separated && limitOk) actions.push('approve');
  }
  if (can('applications.reject') && productOk && ['under_review', 'assessed', 'recommended'].includes(app.status)) {
    if (!workflow.requireSeparationOfDuties || app.recommended_by !== auth.userId) actions.push('reject');
  }
  if (can('offers.prepare') && productOk && app.status === 'approved') actions.push('issue_offer');
  if (can('disbursements.record') && productOk && app.status === 'offer_accepted') actions.push('record_disbursement');
  if (can('repayments.record') && productOk && app.status === 'disbursed') actions.push('record_repayment');
  if (can('documents.verify')) actions.push('verify_documents');
  return actions;
}
