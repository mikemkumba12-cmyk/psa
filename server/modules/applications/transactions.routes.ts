import { Router, type Request } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { many, one, transaction } from '../../db/pool';
import { audit } from '../../lib/audit';
import { badRequest, conflict, forbidden, notFound, parse, route, unprocessable } from '../../lib/http';
import { newId } from '../../lib/ids';
import { quoteLoan, round2 } from '../../lib/loanMath';
import { assertApplicationAccess, staffApplicationScope } from '../../auth/access';
import { assertPermission } from '../../auth/permissions';
import { notifyUser } from '../notifications/notify';
import { loadApplication, transition } from './applications.service';

/**
 * Money movements use maker-checker: one person records a transaction with its
 * external reference (bank, mobile money or payroll), and a different person with
 * confirm permission checks it against the source before it changes the loan.
 */
export const transactionsRouter = Router();

const recordSchema = z.object({
  type: z.enum(['disbursement', 'repayment']),
  amount: z.number().positive().max(1e13),
  valueDate: z.iso.date(),
  channel: z.enum(['bank_transfer', 'mobile_money', 'payroll', 'cash', 'cheque']),
  externalReference: z.string().trim().min(3, 'Enter the bank, mobile money or payroll reference.').max(120),
  notes: z.string().trim().max(1000).optional(),
});

async function outstandingTotal(applicationId: string, client?: PoolClient): Promise<number> {
  const row = await one<{ outstanding: number }>(
    'SELECT COALESCE(sum(total_due - amount_paid), 0)::float AS outstanding FROM loan_installments WHERE application_id = $1',
    [applicationId],
    client,
  );
  return round2(row?.outstanding ?? 0);
}

transactionsRouter.post('/applications/:id/transactions', route(async (req, res) => {
  const input = parse(recordSchema, req.body);
  if (!req.auth!.isStaff) throw forbidden();
  assertPermission(req, input.type === 'disbursement' ? 'disbursements.record' : 'repayments.record');
  await assertApplicationAccess(req, req.params.id);
  const app = await loadApplication(req.params.id);
  if (input.valueDate > new Date().toISOString().slice(0, 10)) throw badRequest('The value date cannot be in the future.');

  if (input.type === 'disbursement') {
    if (app.status !== 'offer_accepted') throw conflict('A disbursement can only be recorded after the borrower accepts the offer.');
    const pending = await one(`SELECT 1 FROM loan_transactions WHERE application_id = $1 AND type = 'disbursement' AND status <> 'rejected'`, [app.id]);
    if (pending) throw conflict('A disbursement has already been recorded for this loan.');
    const offer = await one(`SELECT schedule FROM loan_offers WHERE application_id = $1 AND status = 'accepted' ORDER BY responded_at DESC LIMIT 1`, [app.id]);
    const net = Number(offer?.schedule?.netDisbursement);
    if (Number.isFinite(net) && Math.abs(net - input.amount) > 0.009) {
      throw unprocessable(`The disbursement must equal the net amount in the accepted offer (MWK ${net.toLocaleString('en-US')}).`);
    }
  } else {
    if (app.status !== 'disbursed') throw conflict('Repayments can only be recorded on an active loan.');
    const outstanding = await outstandingTotal(app.id);
    const pending = await one<{ total: number }>(`SELECT COALESCE(sum(amount), 0)::float AS total FROM loan_transactions WHERE application_id = $1 AND type = 'repayment' AND status = 'pending_confirmation'`, [app.id]);
    if (input.amount > round2(outstanding - (pending?.total ?? 0)) + 0.009) {
      throw unprocessable(`This is more than the outstanding balance (MWK ${outstanding.toLocaleString('en-US')}, including payments awaiting confirmation).`);
    }
  }

  const duplicate = await one(`SELECT 1 FROM loan_transactions WHERE channel = $1 AND upper(external_reference) = upper($2) AND status <> 'rejected'`, [input.channel, input.externalReference]);
  if (duplicate) throw conflict('A transaction with this reference has already been recorded.');

  const id = newId('txn');
  await transaction(async client => {
    await client.query(
      `INSERT INTO loan_transactions (id, application_id, type, amount, value_date, channel, external_reference, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, app.id, input.type, input.amount, input.valueDate, input.channel, input.externalReference, input.notes ?? null, req.auth!.userId],
    );
    await audit(req, { action: `transaction.record_${input.type}`, entityType: 'application', entityId: app.id, summary: `Recorded ${input.type} of MWK ${input.amount.toLocaleString('en-US')} on ${app.reference} for confirmation.`, metadata: { transactionId: id, channel: input.channel } }, client);
  });
  res.status(201).json({ id, status: 'pending_confirmation' });
}));

/** Confirmation queue for checkers. */
transactionsRouter.get('/transactions', route(async (req, res) => {
  if (!req.auth!.isStaff) throw forbidden();
  const input = parse(z.object({ status: z.enum(['pending_confirmation', 'confirmed', 'rejected']).default('pending_confirmation'), type: z.enum(['disbursement', 'repayment']).optional() }), req.query);
  const scope = await staffApplicationScope(req, 'a', 1);
  const params: unknown[] = [...scope.params, input.status];
  let typeFilter = '';
  if (input.type) { params.push(input.type); typeFilter = `AND t.type = $${params.length}`; }
  const rows = await many(
    `SELECT t.*, a.reference, a.applicant_name, r.name AS recorded_by_name, c.name AS confirmed_by_name
       FROM loan_transactions t JOIN loan_applications a ON a.id = t.application_id
       JOIN users r ON r.id = t.recorded_by LEFT JOIN users c ON c.id = t.confirmed_by
      WHERE ${scope.sql} AND t.status = $${scope.params.length + 1} ${typeFilter}
      ORDER BY t.recorded_at DESC LIMIT 200`,
    params,
  );
  res.json(rows.map(row => ({
    id: row.id, applicationId: row.application_id, reference: row.reference, applicantName: row.applicant_name, type: row.type,
    amount: row.amount, valueDate: row.value_date, channel: row.channel, externalReference: row.external_reference, status: row.status,
    notes: row.notes, recordedBy: row.recorded_by_name, recordedById: row.recorded_by, recordedAt: row.recorded_at,
    confirmedBy: row.confirmed_by_name, confirmedAt: row.confirmed_at, rejectionReason: row.rejection_reason,
    canConfirm: row.status === 'pending_confirmation' && row.recorded_by !== req.auth!.userId
      && req.auth!.permissions.has(row.type === 'disbursement' ? 'disbursements.confirm' : 'repayments.confirm'),
  })));
}));

async function loadPendingTransaction(req: Request, id: string, client: PoolClient) {
  const txn = await one(`SELECT * FROM loan_transactions WHERE id = $1 FOR UPDATE`, [id], client);
  if (!txn) throw notFound('Transaction not found.');
  await assertApplicationAccess(req, txn.application_id);
  assertPermission(req, txn.type === 'disbursement' ? 'disbursements.confirm' : 'repayments.confirm');
  if (txn.status !== 'pending_confirmation') throw conflict('This transaction has already been processed.');
  if (txn.recorded_by === req.auth!.userId) throw forbidden('Maker-checker: you cannot confirm a transaction you recorded.');
  return txn;
}

transactionsRouter.post('/transactions/:id/confirm', route(async (req, res) => {
  if (!req.auth!.isStaff) throw forbidden();
  const result = await transaction(async client => {
    const txn = await loadPendingTransaction(req, req.params.id, client);
    const app = await loadApplication(txn.application_id, client, true);
    await client.query(`UPDATE loan_transactions SET status = 'confirmed', confirmed_by = $2, confirmed_at = now() WHERE id = $1`, [txn.id, req.auth!.userId]);

    if (txn.type === 'disbursement') {
      if (app.status !== 'offer_accepted') throw conflict('The loan is no longer awaiting disbursement.');
      const offer = await one(`SELECT * FROM loan_offers WHERE application_id = $1 AND status = 'accepted' ORDER BY responded_at DESC LIMIT 1`, [app.id], client);
      // The repayment schedule runs from the actual disbursement date.
      const quote = quoteLoan({
        principal: offer.amount, termMonths: offer.term_months, monthlyRatePct: Number(offer.interest_rate_monthly),
        interestMethod: offer.interest_method, repaymentFrequency: offer.repayment_frequency, fees: offer.fees, startDate: txn.value_date,
      });
      for (const line of quote.schedule) {
        await client.query(
          `INSERT INTO loan_installments (id, application_id, installment_number, due_date, principal_due, interest_due, total_due, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled')`,
          [newId('ins'), app.id, line.installmentNumber, line.dueDate, line.principal, line.interest, line.total],
        );
      }
      await transition(client, app, 'disbursed', req, `Disbursement confirmed (${txn.channel} ${txn.external_reference})`, 'disbursed_at = $4', [txn.value_date]);
      await audit(req, { action: 'transaction.confirm_disbursement', entityType: 'application', entityId: app.id, summary: `Confirmed disbursement on ${app.reference}; repayment schedule created.`, metadata: { transactionId: txn.id, installments: quote.schedule.length } }, client);
      if (app.user_id) await notifyUser(app.user_id, { type: 'success', title: 'Loan disbursed', body: `Funds for ${app.reference} have been disbursed. Your first repayment is due ${quote.schedule[0].dueDate}.`, actionRoute: `/client/applications/${app.id}` }, client);
      return { applicationId: app.id };
    }

    // Repayment: allocate to the oldest unpaid installments.
    if (app.status !== 'disbursed') throw conflict('This loan is not active.');
    let remaining = round2(Number(txn.amount));
    const installments = await many(
      `SELECT id, total_due, amount_paid FROM loan_installments WHERE application_id = $1 AND amount_paid < total_due ORDER BY installment_number FOR UPDATE`,
      [app.id], client,
    );
    const outstanding = round2(installments.reduce((sum, row) => sum + (row.total_due - row.amount_paid), 0));
    if (remaining > outstanding + 0.009) throw unprocessable('This repayment is larger than the outstanding balance. Reject it and record the correct amount.');
    for (const row of installments) {
      if (remaining <= 0) break;
      const pay = round2(Math.min(remaining, row.total_due - row.amount_paid));
      const fullyPaid = round2(row.amount_paid + pay) >= row.total_due - 0.009;
      await client.query(
        `UPDATE loan_installments SET amount_paid = amount_paid + $2, status = $3, paid_at = CASE WHEN $4 THEN $5::date ELSE paid_at END WHERE id = $1`,
        [row.id, pay, fullyPaid ? 'paid' : 'partially_paid', fullyPaid, txn.value_date],
      );
      remaining = round2(remaining - pay);
    }
    const left = await outstandingTotal(app.id, client);
    if (left <= 0.009) {
      await transition(client, app, 'closed', req, 'Loan fully repaid', 'closed_at = now(), completed_at = now()');
    }
    await audit(req, { action: 'transaction.confirm_repayment', entityType: 'application', entityId: app.id, summary: `Confirmed repayment of MWK ${Number(txn.amount).toLocaleString('en-US')} on ${app.reference}.`, metadata: { transactionId: txn.id, outstandingAfter: left } }, client);
    if (app.user_id) await notifyUser(app.user_id, { type: 'success', title: 'Repayment received', body: `MWK ${Number(txn.amount).toLocaleString('en-US')} received for ${app.reference}.${left <= 0.009 ? ' Your loan is fully repaid.' : ''}`, actionRoute: `/client/applications/${app.id}` }, client);
    return { applicationId: app.id, outstanding: left };
  });
  res.json({ confirmed: true, ...result });
}));

transactionsRouter.post('/transactions/:id/reject', route(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(5).max(500) }), req.body);
  if (!req.auth!.isStaff) throw forbidden();
  await transaction(async client => {
    const txn = await loadPendingTransaction(req, req.params.id, client);
    await client.query(`UPDATE loan_transactions SET status = 'rejected', confirmed_by = $2, confirmed_at = now(), rejection_reason = $3 WHERE id = $1`, [txn.id, req.auth!.userId, reason]);
    await audit(req, { action: 'transaction.reject', entityType: 'application', entityId: txn.application_id, summary: `Rejected recorded ${txn.type}: ${reason}`, metadata: { transactionId: txn.id } }, client);
    await notifyUser(txn.recorded_by, { type: 'warning', title: `${txn.type === 'disbursement' ? 'Disbursement' : 'Repayment'} not confirmed`, body: reason, actionRoute: `/staff/applications/${txn.application_id}` }, client);
  });
  res.json({ rejected: true });
}));
