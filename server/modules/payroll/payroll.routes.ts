import { Router } from 'express';
import { z } from 'zod';
import { many, one, transaction } from '../../db/pool';
import { audit } from '../../lib/audit';
import { notFound, parse, route } from '../../lib/http';
import { newId } from '../../lib/ids';
import { round2 } from '../../lib/loanMath';
import { requirePermission } from '../../auth/permissions';

/**
 * Payroll deduction reconciliation. Each row of an employer's deduction file is matched
 * to a customer by employee number and to their active payroll loan. Matched rows become
 * repayment transactions AWAITING CONFIRMATION by a second person — the upload alone
 * never changes a loan balance.
 */
export const payrollRouter = Router();

const rowSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(100),
  employeeName: z.string().trim().max(255).default(''),
  amount: z.coerce.number().positive().max(1e12),
});

const batchSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  employer: z.string().trim().min(2).max(255),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM.'),
  valueDate: z.iso.date(),
  rows: z.array(z.unknown()).min(1).max(5000),
});

payrollRouter.post('/payroll/batches', requirePermission('payroll.manage', 'repayments.record'), route(async (req, res) => {
  const input = parse(batchSchema, req.body);
  const batchId = newId('pay');
  const results: Array<{ row: number; employeeNumber: string; status: string; message?: string; reference?: string }> = [];

  await transaction(async client => {
    await client.query(
      `INSERT INTO payroll_batches (id, month, employer, file_name, uploaded_by, status) VALUES ($1, $2, $3, $4, $5, 'processing')`,
      [batchId, input.month, input.employer, input.fileName, req.auth!.userId],
    );
    let matched = 0;
    let total = 0;
    for (const [index, raw] of input.rows.entries()) {
      const parsed = rowSchema.safeParse(raw);
      const recordId = newId('prr');
      if (!parsed.success) {
        results.push({ row: index + 1, employeeNumber: String((raw as any)?.employeeNumber ?? ''), status: 'invalid', message: parsed.error.issues[0]?.message });
        continue;
      }
      const row = parsed.data;
      total += row.amount;
      const customer = await one('SELECT id, name FROM customers WHERE upper(employee_number) = upper($1)', [row.employeeNumber], client);
      let status = 'unmatched';
      let message = 'No customer with this employee number.';
      let applicationId: string | null = null;
      let transactionId: string | null = null;
      if (customer) {
        const loans = await many(
          `SELECT a.id, a.reference FROM loan_applications a JOIN loan_products p ON p.id = a.product_id
            WHERE a.customer_id = $1 AND a.status = 'disbursed' AND p.category = 'payroll' ORDER BY a.disbursed_at`,
          [customer.id], client,
        );
        if (!loans.length) {
          status = 'no_active_loan';
          message = 'Customer has no active payroll loan.';
        } else if (loans.length > 1) {
          status = 'needs_review';
          message = 'Customer has more than one active payroll loan; allocate manually.';
        } else {
          const outstanding = await one<{ n: number }>('SELECT COALESCE(sum(total_due - amount_paid), 0)::float AS n FROM loan_installments WHERE application_id = $1', [loans[0].id], client);
          if (row.amount > round2(outstanding?.n ?? 0) + 0.009) {
            status = 'needs_review';
            message = 'Deduction exceeds the outstanding balance.';
          } else {
            applicationId = loans[0].id;
            transactionId = newId('txn');
            await client.query(
              `INSERT INTO loan_transactions (id, application_id, type, amount, value_date, channel, external_reference, notes, recorded_by)
               VALUES ($1, $2, 'repayment', $3, $4, 'payroll', $5, $6, $7)`,
              [transactionId, applicationId, row.amount, input.valueDate, `${input.employer}:${input.month}:${row.employeeNumber}`.slice(0, 120),
                `Payroll batch ${input.fileName}`, req.auth!.userId],
            );
            status = 'matched';
            message = `Repayment recorded on ${loans[0].reference}; awaiting confirmation.`;
            matched += 1;
          }
        }
      }
      await client.query(
        `INSERT INTO payroll_records (id, batch_id, employee_id, employee_name, employer, deduction_amount, month, status, customer_id, application_id, transaction_id, failure_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [recordId, batchId, row.employeeNumber, row.employeeName || customer?.name || '', input.employer, row.amount, input.month, status,
          customer?.id ?? null, applicationId, transactionId, status === 'matched' ? null : message],
      );
      results.push({ row: index + 1, employeeNumber: row.employeeNumber, status, message });
    }
    await client.query(
      `UPDATE payroll_batches SET total_records = $2, matched_count = $3, unmatched_count = $4, total_amount = $5, status = 'processed' WHERE id = $1`,
      [batchId, input.rows.length, matched, input.rows.length - matched, round2(total)],
    );
    await audit(req, { action: 'payroll.upload', entityType: 'payroll_batch', entityId: batchId, summary: `Processed payroll file ${input.fileName}: ${matched} of ${input.rows.length} rows matched.`, metadata: { employer: input.employer, month: input.month } }, client);
  });
  res.status(201).json({ batchId, results });
}));

payrollRouter.get('/payroll/batches', requirePermission('payroll.manage'), route(async (_req, res) => {
  const rows = await many(
    `SELECT b.*, u.name AS uploaded_by_name FROM payroll_batches b LEFT JOIN users u ON u.id = b.uploaded_by ORDER BY b.uploaded_at DESC LIMIT 200`,
  );
  res.json(rows.map(row => ({
    id: row.id, month: row.month, employer: row.employer, fileName: row.file_name, uploadedBy: row.uploaded_by_name, uploadedAt: row.uploaded_at,
    totalRecords: row.total_records, matched: row.matched_count, unmatched: row.unmatched_count, totalAmount: row.total_amount, status: row.status,
  })));
}));

payrollRouter.get('/payroll/batches/:id', requirePermission('payroll.manage'), route(async (req, res) => {
  const batch = await one('SELECT * FROM payroll_batches WHERE id = $1', [req.params.id]);
  if (!batch) throw notFound('Batch not found.');
  const records = await many(
    `SELECT r.*, t.status AS transaction_status, a.reference FROM payroll_records r
       LEFT JOIN loan_transactions t ON t.id = r.transaction_id LEFT JOIN loan_applications a ON a.id = r.application_id
      WHERE r.batch_id = $1 ORDER BY r.created_at`,
    [batch.id],
  );
  res.json({
    id: batch.id, month: batch.month, employer: batch.employer, fileName: batch.file_name, status: batch.status,
    records: records.map(row => ({
      id: row.id, employeeNumber: row.employee_id, employeeName: row.employee_name, amount: row.deduction_amount, status: row.status,
      reason: row.failure_reason, applicationReference: row.reference, transactionStatus: row.transaction_status,
    })),
  });
}));
