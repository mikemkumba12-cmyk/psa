import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool';
import { audit } from '../../lib/audit';
import { parse, route } from '../../lib/http';
import { requirePermission } from '../../auth/permissions';

/**
 * Operational and portfolio reporting. Every figure is an aggregate SQL query
 * over transactional tables; nothing is hard-coded or sampled. Each response
 * says how much of the underlying data is demo/test data.
 */
export const reportsRouter = Router();

const rangeSchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  includeDemo: z.enum(['true', 'false']).default('true'),
});

function resolveRange(input: { from?: string; to?: string }) {
  const to = input.to ?? new Date().toISOString().slice(0, 10);
  const from = input.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 364 * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

/** Outstanding balances and arrears per loan, computed from the repayment schedule. */
const LOAN_POSITIONS = `
  SELECT a.id, a.product_id, a.data_source, a.borrower_type,
         sum(i.principal_due) - sum(LEAST(i.principal_due, GREATEST(0, i.amount_paid - i.interest_due - i.penalty_due))) AS outstanding_principal,
         sum(i.total_due - i.amount_paid) AS outstanding_total,
         sum(CASE WHEN i.due_date < current_date THEN i.total_due - i.amount_paid ELSE 0 END) AS arrears,
         COALESCE(current_date - min(i.due_date) FILTER (WHERE i.due_date < current_date AND i.amount_paid < i.total_due - 0.009), 0) AS days_past_due
    FROM loan_applications a JOIN loan_installments i ON i.application_id = a.id
   WHERE a.status = 'disbursed'
   GROUP BY a.id`;

async function dataComposition() {
  return one(
    `SELECT count(*) FILTER (WHERE data_source = 'live')::int AS live_applications,
            count(*) FILTER (WHERE data_source <> 'live')::int AS demo_applications
       FROM loan_applications WHERE status <> 'draft'`,
  );
}

reportsRouter.get('/reports/overview', requirePermission('reports.view'), route(async (req, res) => {
  const input = parse(rangeSchema, req.query);
  const { from, to } = resolveRange(input);
  const demo = input.includeDemo === 'true';
  const demoFilter = demo ? '' : `AND a.data_source = 'live'`;

  const pipeline = await many(
    `SELECT a.status, count(*)::int AS count, COALESCE(sum(a.amount), 0)::float AS amount
       FROM loan_applications a WHERE a.status <> 'draft' ${demoFilter} GROUP BY a.status`,
  );
  const decisions = await one(
    `SELECT count(*) FILTER (WHERE status IN ('approved','offer_issued','offer_accepted','offer_declined','disbursed','closed'))::int AS approved,
            count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
            round(avg(EXTRACT(EPOCH FROM (decided_at - submitted_at)) / 86400)::numeric, 1)::float AS avg_days_to_decision,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (decided_at - submitted_at)) / 86400)::float AS median_days_to_decision
       FROM loan_applications a WHERE decided_at::date BETWEEN $1 AND $2 ${demoFilter}`,
    [from, to],
  );
  const flows = await one(
    `SELECT COALESCE(sum(t.amount) FILTER (WHERE t.type = 'disbursement'), 0)::float AS disbursed,
            COALESCE(sum(t.amount) FILTER (WHERE t.type = 'repayment'), 0)::float AS collected,
            count(*) FILTER (WHERE t.type = 'disbursement')::int AS disbursement_count
       FROM loan_transactions t JOIN loan_applications a ON a.id = t.application_id
      WHERE t.status = 'confirmed' AND t.value_date BETWEEN $1 AND $2 ${demoFilter}`,
    [from, to],
  );
  const portfolio = await one(
    `SELECT count(*)::int AS active_loans,
            COALESCE(sum(outstanding_principal), 0)::float AS outstanding_principal,
            COALESCE(sum(outstanding_total), 0)::float AS outstanding_total,
            COALESCE(sum(arrears), 0)::float AS arrears,
            count(*) FILTER (WHERE arrears > 0.009)::int AS loans_in_arrears,
            COALESCE(sum(outstanding_principal) FILTER (WHERE days_past_due > 30), 0)::float AS principal_at_risk_30
       FROM (${LOAN_POSITIONS}) p ${demo ? '' : `WHERE p.data_source = 'live'`}`,
  );
  const dueInPeriod = await one(
    `SELECT COALESCE(sum(i.total_due), 0)::float AS due, COALESCE(sum(LEAST(i.amount_paid, i.total_due)), 0)::float AS paid
       FROM loan_installments i JOIN loan_applications a ON a.id = i.application_id
      WHERE i.due_date BETWEEN $1 AND LEAST($2::date, current_date) ${demoFilter}`,
    [from, to],
  );
  const monthly = await many(
    `WITH months AS (SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month')::date AS month)
     SELECT to_char(m.month, 'YYYY-MM') AS month,
            (SELECT count(*)::int FROM loan_applications a WHERE date_trunc('month', a.submitted_at)::date = m.month ${demoFilter}) AS submitted,
            (SELECT count(*)::int FROM application_events e JOIN loan_applications a ON a.id = e.application_id
              WHERE e.to_status = 'approved' AND date_trunc('month', e.created_at)::date = m.month ${demoFilter}) AS approved,
            (SELECT count(*)::int FROM application_events e JOIN loan_applications a ON a.id = e.application_id
              WHERE e.to_status = 'rejected' AND date_trunc('month', e.created_at)::date = m.month ${demoFilter}) AS rejected,
            (SELECT COALESCE(sum(t.amount), 0)::float FROM loan_transactions t JOIN loan_applications a ON a.id = t.application_id
              WHERE t.status = 'confirmed' AND t.type = 'disbursement' AND date_trunc('month', t.value_date)::date = m.month ${demoFilter}) AS disbursed,
            (SELECT COALESCE(sum(t.amount), 0)::float FROM loan_transactions t JOIN loan_applications a ON a.id = t.application_id
              WHERE t.status = 'confirmed' AND t.type = 'repayment' AND date_trunc('month', t.value_date)::date = m.month ${demoFilter}) AS collected
       FROM months m ORDER BY m.month`,
    [from, to],
  );
  const byProduct = await many(
    `SELECT p.id, p.name, p.borrower_type,
            count(a.id) FILTER (WHERE a.status <> 'draft')::int AS applications,
            count(a.id) FILTER (WHERE a.status IN ('disbursed', 'closed'))::int AS funded,
            COALESCE(pos.outstanding_principal, 0)::float AS outstanding_principal,
            COALESCE(pos.arrears, 0)::float AS arrears
       FROM loan_products p
       LEFT JOIN loan_applications a ON a.product_id = p.id ${demo ? '' : `AND a.data_source = 'live'`}
       LEFT JOIN (SELECT product_id, sum(outstanding_principal) AS outstanding_principal, sum(arrears) AS arrears
                    FROM (${LOAN_POSITIONS}) x ${demo ? '' : `WHERE x.data_source = 'live'`} GROUP BY product_id) pos ON pos.product_id = p.id
      GROUP BY p.id, p.name, p.borrower_type, pos.outstanding_principal, pos.arrears
      ORDER BY applications DESC, p.name`,
  );

  const approved = decisions?.approved ?? 0;
  const rejected = decisions?.rejected ?? 0;
  const outstanding = portfolio?.outstanding_principal ?? 0;
  res.json({
    range: { from, to },
    includesDemoData: demo,
    dataComposition: await dataComposition(),
    pipeline,
    decisions: { approved, rejected, approvalRate: approved + rejected ? approved / (approved + rejected) : null, avgDaysToDecision: decisions?.avg_days_to_decision ?? null, medianDaysToDecision: decisions?.median_days_to_decision ?? null },
    flows,
    portfolio: { ...portfolio, par30: outstanding > 0 ? (portfolio!.principal_at_risk_30 / outstanding) : null },
    collectionRate: dueInPeriod && dueInPeriod.due > 0 ? dueInPeriod.paid / dueInPeriod.due : null,
    monthly,
    byProduct,
    definitions: {
      approvalRate: 'Approved ÷ (approved + rejected), for decisions made in the period.',
      collectionRate: 'Amount paid ÷ amount due, for installments that fell due in the period (up to today).',
      par30: 'Outstanding principal of loans more than 30 days past due ÷ total outstanding principal.',
      outstandingPrincipal: 'Scheduled principal less principal covered by confirmed repayments (interest is settled first).',
    },
  });
}));

reportsRouter.get('/reports/sme', requirePermission('reports.sme'), route(async (req, res) => {
  const input = parse(rangeSchema, req.query);
  const { from, to } = resolveRange(input);
  const demoFilter = input.includeDemo === 'true' ? '' : `AND a.data_source = 'live'`;
  const stages = await many(
    `SELECT a.status, count(*)::int AS count, COALESCE(sum(a.amount), 0)::float AS amount
       FROM loan_applications a WHERE a.borrower_type = 'business' AND a.status <> 'draft' ${demoFilter} GROUP BY a.status`,
  );
  const verificationQueue = await one(
    `SELECT count(*) FILTER (WHERE verification_status = 'pending_verification')::int AS businesses_awaiting_verification,
            count(*) FILTER (WHERE verification_status = 'verified')::int AS verified_businesses,
            count(*)::int AS total_businesses
       FROM businesses ${input.includeDemo === 'true' ? '' : `WHERE data_source = 'live'`}`,
  );
  const pendingDocuments = await one(
    `SELECT count(*)::int AS n FROM documents d
      WHERE d.deleted_at IS NULL AND d.status = 'pending_review'
        AND (d.business_id IS NOT NULL OR d.application_id IN (SELECT id FROM loan_applications WHERE borrower_type = 'business'))`,
  );
  const waitingOnApplicant = await one(`SELECT count(*)::int AS n FROM loan_applications a WHERE a.borrower_type = 'business' AND a.status = 'info_requested' ${demoFilter}`);
  const bySector = await many(
    `SELECT b.sector, count(DISTINCT a.id)::int AS applications,
            count(DISTINCT a.id) FILTER (WHERE a.status IN ('disbursed', 'closed'))::int AS funded,
            COALESCE(sum(a.approved_amount) FILTER (WHERE a.status IN ('disbursed', 'closed')), 0)::float AS funded_amount
       FROM loan_applications a JOIN businesses b ON b.id = a.business_id
      WHERE a.status <> 'draft' AND a.submitted_at::date BETWEEN $1 AND $2 ${demoFilter}
      GROUP BY b.sector ORDER BY applications DESC`,
    [from, to],
  );
  const turnaround = await many(
    `SELECT p.name AS product, count(*)::int AS decided,
            round(avg(EXTRACT(EPOCH FROM (a.decided_at - a.submitted_at)) / 86400)::numeric, 1)::float AS avg_days
       FROM loan_applications a JOIN loan_products p ON p.id = a.product_id
      WHERE a.borrower_type = 'business' AND a.decided_at::date BETWEEN $1 AND $2 ${demoFilter}
      GROUP BY p.name ORDER BY p.name`,
    [from, to],
  );
  const portfolio = await one(
    `SELECT count(*)::int AS active_loans, COALESCE(sum(outstanding_principal), 0)::float AS outstanding_principal,
            COALESCE(sum(arrears), 0)::float AS arrears,
            COALESCE(sum(outstanding_principal) FILTER (WHERE days_past_due > 30), 0)::float AS principal_at_risk_30
       FROM (${LOAN_POSITIONS}) p WHERE p.borrower_type = 'business' ${input.includeDemo === 'true' ? '' : `AND p.data_source = 'live'`}`,
  );
  res.json({
    range: { from, to },
    includesDemoData: input.includeDemo === 'true',
    stages,
    queues: {
      awaitingVerification: (stages.find(row => row.status === 'submitted')?.count ?? 0) + (verificationQueue?.businesses_awaiting_verification ?? 0),
      awaitingAssessment: stages.find(row => row.status === 'under_review')?.count ?? 0,
      awaitingApproval: stages.find(row => row.status === 'recommended')?.count ?? 0,
      waitingOnApplicant: waitingOnApplicant?.n ?? 0,
      documentsPendingReview: pendingDocuments?.n ?? 0,
    },
    businesses: verificationQueue,
    bySector,
    turnaround,
    portfolio: { ...portfolio, par30: portfolio && portfolio.outstanding_principal > 0 ? portfolio.principal_at_risk_30 / portfolio.outstanding_principal : null },
  });
}));

reportsRouter.get('/reports/history', requirePermission('reports.view'), route(async (req, res) => {
  const input = parse(rangeSchema, req.query);
  const { from, to } = resolveRange(input);
  const rows = await many(
    `SELECT snapshot_date, sum(active_loans)::int AS active_loans, sum(outstanding_principal)::float AS outstanding_principal,
            sum(arrears_amount)::float AS arrears, sum(principal_at_risk_30)::float AS principal_at_risk_30, bool_or(includes_demo_data) AS includes_demo
       FROM portfolio_snapshots WHERE snapshot_date BETWEEN $1 AND $2 GROUP BY snapshot_date ORDER BY snapshot_date`,
    [from, to],
  );
  res.json({ range: { from, to }, points: rows });
}));

/** Data quality checks so problems are visible instead of silently skewing reports. */
reportsRouter.get('/reports/data-quality', requirePermission('reports.view'), route(async (_req, res) => {
  const checks = await many(
    `SELECT 'customers_without_national_id' AS check, count(*)::int AS count FROM customers WHERE national_id IS NULL
     UNION ALL SELECT 'applications_without_product', count(*)::int FROM loan_applications WHERE product_id IS NULL
     UNION ALL SELECT 'disbursed_without_schedule', count(*)::int FROM loan_applications a WHERE a.status = 'disbursed' AND NOT EXISTS (SELECT 1 FROM loan_installments i WHERE i.application_id = a.id)
     UNION ALL SELECT 'schedule_overpaid', count(*)::int FROM loan_installments WHERE amount_paid > total_due + 0.009
     UNION ALL SELECT 'transactions_pending_over_3_days', count(*)::int FROM loan_transactions WHERE status = 'pending_confirmation' AND recorded_at < now() - interval '3 days'
     UNION ALL SELECT 'documents_pending_review_over_7_days', count(*)::int FROM documents WHERE status = 'pending_review' AND deleted_at IS NULL AND uploaded_at < now() - interval '7 days'
     UNION ALL SELECT 'expired_verified_documents', count(*)::int FROM documents WHERE status = 'verified' AND deleted_at IS NULL AND expires_on < current_date
     UNION ALL SELECT 'demo_records_present', (SELECT count(*)::int FROM loan_applications WHERE data_source <> 'live') + (SELECT count(*)::int FROM customers WHERE data_source <> 'live')`,
  );
  const volumes = await one(
    `SELECT (SELECT count(*) FROM customers)::int AS customers, (SELECT count(*) FROM businesses)::int AS businesses,
            (SELECT count(*) FROM loan_applications)::int AS applications, (SELECT count(*) FROM loan_installments)::int AS installments,
            (SELECT count(*) FROM loan_transactions)::int AS transactions, (SELECT count(*) FROM documents)::int AS documents,
            (SELECT count(*) FROM audit_logs)::int AS audit_events,
            pg_size_pretty(pg_database_size(current_database())) AS database_size`,
  );
  res.json({ checks, volumes, checkedAt: new Date().toISOString() });
}));

// ── CSV export ───────────────────────────────────────────────────────────────

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value instanceof Date ? value.toISOString() : String(value ?? '');
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [headers.join(','), ...rows.map(row => headers.map(header => escape(row[header])).join(','))].join('\n');
}

const EXPORTS: Record<string, { permission: 'reports.export'; sql: string }> = {
  applications: {
    permission: 'reports.export',
    sql: `SELECT a.reference, a.status, a.borrower_type, a.applicant_name, b.registered_name AS business, p.name AS product, a.amount, a.term_months,
                 a.approved_amount, a.submitted_at, a.decided_at, o.name AS assigned_officer, a.data_source
            FROM loan_applications a JOIN loan_products p ON p.id = a.product_id LEFT JOIN businesses b ON b.id = a.business_id
            LEFT JOIN users o ON o.id = a.assigned_officer_id
           WHERE a.status <> 'draft' AND COALESCE(a.submitted_at, a.created_at)::date BETWEEN $1 AND $2 ORDER BY a.submitted_at`,
  },
  transactions: {
    permission: 'reports.export',
    sql: `SELECT a.reference, t.type, t.amount, t.value_date, t.channel, t.external_reference, t.status, r.name AS recorded_by, c.name AS confirmed_by, t.data_source
            FROM loan_transactions t JOIN loan_applications a ON a.id = t.application_id JOIN users r ON r.id = t.recorded_by LEFT JOIN users c ON c.id = t.confirmed_by
           WHERE t.value_date BETWEEN $1 AND $2 ORDER BY t.value_date`,
  },
  portfolio: {
    permission: 'reports.export',
    sql: `SELECT a.reference, a.applicant_name, p.name AS product, round(pos.outstanding_principal::numeric, 2) AS outstanding_principal,
                 round(pos.outstanding_total::numeric, 2) AS outstanding_total, round(pos.arrears::numeric, 2) AS arrears, pos.days_past_due, a.data_source
            FROM (${LOAN_POSITIONS}) pos JOIN loan_applications a ON a.id = pos.id JOIN loan_products p ON p.id = a.product_id
           WHERE $1::date IS NOT NULL AND $2::date IS NOT NULL ORDER BY pos.days_past_due DESC`,
  },
};

reportsRouter.get('/reports/export/:type', requirePermission('reports.export'), route(async (req, res) => {
  const spec = EXPORTS[req.params.type];
  if (!spec) {
    res.status(404).json({ error: 'Unknown export.' });
    return;
  }
  const { from, to } = resolveRange(parse(rangeSchema, req.query));
  const rows = (await query(spec.sql, [from, to])).rows;
  await audit(req, { action: 'report.export', entityType: 'report', entityId: req.params.type, summary: `Exported ${rows.length} ${req.params.type} rows.`, metadata: { from, to } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-${from}-to-${to}.csv"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(toCsv(rows));
}));

/** Daily portfolio snapshot used for historical trend reporting. Idempotent per day. */
export async function snapshotPortfolio(): Promise<void> {
  await query(
    `INSERT INTO portfolio_snapshots (snapshot_date, product_id, active_loans, outstanding_principal, outstanding_total, arrears_amount,
                                      principal_at_risk_30, loans_in_arrears, includes_demo_data)
     SELECT current_date, product_id, count(*), COALESCE(sum(outstanding_principal), 0), COALESCE(sum(outstanding_total), 0), COALESCE(sum(arrears), 0),
            COALESCE(sum(outstanding_principal) FILTER (WHERE days_past_due > 30), 0), count(*) FILTER (WHERE arrears > 0.009),
            bool_or(data_source <> 'live')
       FROM (${LOAN_POSITIONS}) p GROUP BY product_id
     ON CONFLICT (snapshot_date, product_id) DO UPDATE SET active_loans = EXCLUDED.active_loans, outstanding_principal = EXCLUDED.outstanding_principal,
       outstanding_total = EXCLUDED.outstanding_total, arrears_amount = EXCLUDED.arrears_amount, principal_at_risk_30 = EXCLUDED.principal_at_risk_30,
       loans_in_arrears = EXCLUDED.loans_in_arrears, includes_demo_data = EXCLUDED.includes_demo_data, computed_at = now()`,
  );
}
