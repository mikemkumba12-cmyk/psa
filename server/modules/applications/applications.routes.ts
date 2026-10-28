import { Router, type Request } from 'express';
import { z } from 'zod';
import { many, one, transaction } from '../../db/pool';
import { audit } from '../../lib/audit';
import { badRequest, conflict, forbidden, notFound, parse, route, unprocessable } from '../../lib/http';
import { newId } from '../../lib/ids';
import { quoteLoan } from '../../lib/loanMath';
import { assertApplicationAccess, assertBusinessAccess, customerPartyRoles, staffApplicationScope } from '../../auth/access';
import { assertPermission, loadEffectivePermissions, loadProductAccess } from '../../auth/permissions';
import { getProduct, isAvailable, validateAgainstProduct } from '../products/products.service';
import { businessEligibility, individualEligibility } from '../members/eligibility';
import { getSetting, type WorkflowSettings } from '../settings/settings';
import { notifyStaffWithPermission, notifyUser } from '../notifications/notify';
import { blockingForApproval, blockingForSubmission, documentRequirements } from './requirements';
import { runAssessment } from './assessment';
import {
  allowedActions, APPLICANT_EDITABLE, loadApplication, loanPosition, nextReference, PRE_DECISION, productSnapshot,
  STATUSES, transition, type ApplicationRow,
} from './applications.service';

export const applicationsRouter = Router();

const declaredSchema = z.object({
  monthlyNetIncome: z.number().nonnegative().max(1e13).optional(),
  existingMonthlyDeductions: z.number().nonnegative().max(1e13).optional(),
  employerName: z.string().trim().max(255).optional(),
  employeeNumber: z.string().trim().max(100).optional(),
  expectedProceeds: z.number().nonnegative().max(1e13).optional(),
  counterpartyName: z.string().trim().max(255).optional(),
  documentReference: z.string().trim().max(120).optional(),
  assetDescription: z.string().trim().max(500).optional(),
  collateralDescription: z.string().trim().max(1000).optional(),
}).strict();

// ── Presentation ─────────────────────────────────────────────────────────────

async function applicantUserIds(app: Pick<ApplicationRow, 'customer_id' | 'business_id'>): Promise<string[]> {
  const rows = await many<{ user_id: string }>(
    `SELECT DISTINCT c.user_id FROM customers c
      WHERE c.user_id IS NOT NULL AND (c.id = $1 OR c.id IN (
        SELECT customer_id FROM business_parties WHERE business_id = $2 AND role IN ('owner', 'director', 'representative')))`,
    [app.customer_id, app.business_id],
  );
  return rows.map(row => row.user_id);
}

async function notifyApplicants(app: ApplicationRow, title: string, body: string, type: 'info' | 'success' | 'warning' | 'action' = 'info', client?: any) {
  for (const userId of await applicantUserIds(app)) {
    await notifyUser(userId, { type, title, body, actionRoute: `/client/applications/${app.id}`, entityType: 'application', entityId: app.id }, client);
  }
}

function presentSummary(row: any) {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    borrowerType: row.borrower_type,
    applicantName: row.applicant_name,
    customerId: row.customer_id,
    businessId: row.business_id,
    businessName: row.business_name ?? null,
    productId: row.product_id,
    productName: row.product_name,
    productCategory: row.product_category,
    amount: row.amount,
    termMonths: row.term_months,
    approvedAmount: row.approved_amount,
    assignedOfficerId: row.assigned_officer_id,
    assignedOfficerName: row.officer_name ?? null,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDemo: row.data_source !== 'live',
  };
}

const SUMMARY_SELECT = `
  SELECT a.*, p.name AS product_name, p.category AS product_category, b.registered_name AS business_name, o.name AS officer_name
    FROM loan_applications a
    JOIN loan_products p ON p.id = a.product_id
    LEFT JOIN businesses b ON b.id = a.business_id
    LEFT JOIN users o ON o.id = a.assigned_officer_id`;

// ── List and queues ──────────────────────────────────────────────────────────

const listSchema = z.object({
  status: z.string().optional(),
  productId: z.string().max(100).optional(),
  borrowerType: z.enum(['individual', 'business']).optional(),
  assigned: z.enum(['me', 'unassigned', 'any']).default('any'),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  sort: z.enum(['submitted_at', 'amount', 'updated_at', 'created_at']).default('updated_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

applicationsRouter.get('/applications', route(async (req, res) => {
  const auth = req.auth!;
  const input = parse(listSchema, req.query);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (auth.role === 'customer') {
    params.push(auth.customerId);
    conditions.push(`(a.customer_id = $${params.length} OR a.business_id IN (
      SELECT business_id FROM business_parties WHERE customer_id = $${params.length} AND role IN ('owner', 'director', 'representative')))`);
  } else {
    const scope = await staffApplicationScope(req, 'a', params.length + 1);
    params.push(...scope.params);
    conditions.push(scope.sql);
    conditions.push(`a.status <> 'draft'`);
  }
  if (input.status) {
    const statuses = input.status.split(',').filter(status => (STATUSES as readonly string[]).includes(status));
    if (statuses.length) { params.push(statuses); conditions.push(`a.status = ANY($${params.length}::text[])`); }
  }
  if (input.productId) { params.push(input.productId); conditions.push(`a.product_id = $${params.length}`); }
  if (input.borrowerType) { params.push(input.borrowerType); conditions.push(`a.borrower_type = $${params.length}`); }
  if (input.assigned === 'me') { params.push(auth.userId); conditions.push(`a.assigned_officer_id = $${params.length}`); }
  if (input.assigned === 'unassigned') conditions.push('a.assigned_officer_id IS NULL');
  if (input.search) {
    params.push(`%${input.search.toLowerCase()}%`);
    conditions.push(`(lower(a.reference) LIKE $${params.length} OR lower(a.applicant_name) LIKE $${params.length} OR lower(b.registered_name) LIKE $${params.length})`);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM loan_applications a LEFT JOIN businesses b ON b.id = a.business_id ${where}`, params);
  params.push(input.pageSize, (input.page - 1) * input.pageSize);
  const rows = await many(
    `${SUMMARY_SELECT} ${where}
      ORDER BY a.${input.sort} ${input.direction === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, a.id
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({ items: rows.map(presentSummary), total: total?.n ?? 0, page: input.page, pageSize: input.pageSize });
}));

/** Counts for the staff work queue, limited to what this user can see and do. */
applicationsRouter.get('/applications/queues', route(async (req, res) => {
  const auth = req.auth!;
  if (!auth.isStaff) throw forbidden();
  const scope = await staffApplicationScope(req, 'a', 2);
  const rows = await many<{ status: string; n: number; mine: number; unassigned: number }>(
    `SELECT a.status, count(*)::int AS n,
            count(*) FILTER (WHERE a.assigned_officer_id = $1)::int AS mine,
            count(*) FILTER (WHERE a.assigned_officer_id IS NULL)::int AS unassigned
       FROM loan_applications a WHERE a.status <> 'draft' AND ${scope.sql} GROUP BY a.status`,
    [auth.userId, ...scope.params],
  );
  const byStatus = Object.fromEntries(rows.map(row => [row.status, row.n]));
  const mineOpen = rows.filter(row => ['under_review', 'assessed', 'info_requested'].includes(row.status)).reduce((sum, row) => sum + row.mine, 0);

  let awaitingMyApproval = 0;
  if (auth.permissions.has('applications.approve')) {
    const limit = auth.role === 'admin' && auth.approvalLimit === null ? null : auth.approvalLimit ?? -1;
    const row = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM loan_applications a
        WHERE a.status = 'recommended' AND ${scope.sql}
          AND a.recommended_by IS DISTINCT FROM $1 AND a.assigned_officer_id IS DISTINCT FROM $1
          AND ($${scope.params.length + 2}::numeric IS NULL OR a.amount <= $${scope.params.length + 2})`,
      [auth.userId, ...scope.params, limit],
    );
    awaitingMyApproval = row?.n ?? 0;
  }
  const pendingTransactions = auth.permissions.has('disbursements.confirm') || auth.permissions.has('repayments.confirm')
    ? (await one<{ n: number }>(`SELECT count(*)::int AS n FROM loan_transactions WHERE status = 'pending_confirmation' AND recorded_by <> $1`, [auth.userId]))?.n ?? 0
    : 0;
  res.json({
    byStatus,
    assignedToMe: mineOpen,
    unassigned: rows.filter(row => row.status === 'submitted').reduce((sum, row) => sum + row.unassigned, 0),
    awaitingMyApproval,
    pendingTransactions,
  });
}));

// ── Create and edit drafts ───────────────────────────────────────────────────

const createSchema = z.object({
  productId: z.string().min(1).max(100),
  businessId: z.string().max(100).optional(),
  amount: z.number().positive().max(1e13),
  termMonths: z.number().int().min(1).max(360),
  purpose: z.string().trim().min(5, 'Describe what the loan is for.').max(2000),
  declared: declaredSchema.default({}),
  // Staff creating an application on a customer's behalf.
  customerId: z.string().max(100).optional(),
});

applicationsRouter.post('/applications', route(async (req, res) => {
  const auth = req.auth!;
  const input = parse(createSchema, req.body);
  let customerId: string;
  if (auth.role === 'customer') {
    customerId = auth.customerId!;
  } else {
    assertPermission(req, 'customers.manage');
    if (!input.customerId) throw badRequest('Choose the customer this application is for.');
    customerId = input.customerId;
  }
  const customer = await one('SELECT id, name, user_id FROM customers WHERE id = $1', [customerId]);
  if (!customer) throw notFound('Customer not found.');

  const product = await getProduct(input.productId);
  if (!product || (!isAvailable(product) && auth.role === 'customer')) throw notFound('This loan product is not available.');
  if (!isAvailable(product)) throw unprocessable('This loan product is not active.');
  const problems = validateAgainstProduct(product, input.amount, input.termMonths);
  if (problems.length) throw badRequest('The amount or term is outside this product’s limits.', problems);

  let applicantName = customer.name;
  if (product.borrower_type === 'business') {
    if (!input.businessId) throw badRequest('Choose the business that is applying.', [{ field: 'businessId', message: 'Required for business products.' }]);
    await assertBusinessAccess(req, input.businessId, auth.role === 'customer' ? 'manage' : 'view');
    const roles = await customerPartyRoles(customerId, input.businessId);
    if (!roles.some(role => ['owner', 'director', 'representative'].includes(role))) {
      throw forbidden('The applicant must be an owner, director or authorised representative of the business.');
    }
    const business = await one('SELECT registered_name, verification_status FROM businesses WHERE id = $1', [input.businessId]);
    if (business.verification_status === 'rejected') throw unprocessable('This business profile was not verified. Contact your branch.');
    applicantName = business.registered_name;
  } else if (input.businessId) {
    throw badRequest(`${product.name} is for individuals, not businesses.`);
  }

  const id = newId('app');
  await transaction(async client => {
    const reference = await nextReference(client);
    await client.query(
      `INSERT INTO loan_applications (id, reference, user_id, customer_id, business_id, product_id, borrower_type, applicant_name,
                                      amount, term_months, purpose, applicant_declared, status, created_at, updated_at, data_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft', now(), now(), 'live')`,
      [id, reference, customer.user_id, customerId, input.businessId ?? null, product.id, product.borrower_type, applicantName,
        input.amount, input.termMonths, input.purpose, input.declared],
    );
    await client.query(
      `INSERT INTO application_events (application_id, from_status, to_status, actor_id, actor_role, note) VALUES ($1, NULL, 'draft', $2, $3, 'Application started')`,
      [id, auth.userId, auth.role],
    );
    await audit(req, { action: 'application.create', entityType: 'application', entityId: id, summary: `Started ${product.name} application ${reference}.`, metadata: { productId: product.id, amount: input.amount } }, client);
  });
  res.status(201).json(await applicationDetail(req, id));
}));

const updateSchema = z.object({
  amount: z.number().positive().max(1e13).optional(),
  termMonths: z.number().int().min(1).max(360).optional(),
  purpose: z.string().trim().min(5).max(2000).optional(),
  declared: declaredSchema.optional(),
}).strict();

applicationsRouter.patch('/applications/:id', route(async (req, res) => {
  const input = parse(updateSchema, req.body);
  await assertApplicationAccess(req, req.params.id);
  if (req.auth!.isStaff) throw forbidden('Staff cannot edit the applicant’s figures. Use the assessment to record verified figures.');
  const app = await loadApplication(req.params.id);
  if (!APPLICANT_EDITABLE.includes(app.status)) throw conflict('This application can no longer be edited.');
  const product = (await getProduct(app.product_id))!;
  const amount = input.amount ?? app.amount;
  const term = input.termMonths ?? app.term_months;
  const problems = validateAgainstProduct(product, amount, term);
  if (problems.length) throw badRequest('The amount or term is outside this product’s limits.', problems);
  await transaction(async client => {
    await client.query(
      `UPDATE loan_applications SET amount = $2, term_months = $3, purpose = COALESCE($4, purpose),
              applicant_declared = applicant_declared || $5::jsonb, updated_at = now()
        WHERE id = $1`,
      [app.id, amount, term, input.purpose ?? null, JSON.stringify(input.declared ?? {})],
    );
    await audit(req, { action: 'application.update', entityType: 'application', entityId: app.id, summary: `Updated application ${app.reference}.`, metadata: { fields: Object.keys(input) } }, client);
  });
  res.json(await applicationDetail(req, app.id));
}));

// ── Detail ───────────────────────────────────────────────────────────────────

async function applicationDetail(req: Request, id: string) {
  const app = await loadApplication(id);
  const product = (await getProduct(app.product_id))!;
  const summary = await one(`${SUMMARY_SELECT} WHERE a.id = $1`, [id]);
  const requirements = await documentRequirements(app);
  const eligibility = app.borrower_type === 'business' && app.business_id
    ? await businessEligibility(app.business_id, app.customer_id)
    : await individualEligibility(app.customer_id);
  const events = await many(
    `SELECT e.from_status, e.to_status, e.note, e.created_at, e.actor_role, u.name AS actor_name
       FROM application_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.application_id = $1 ORDER BY e.created_at, e.id`,
    [id],
  );
  const offers = await many('SELECT * FROM loan_offers WHERE application_id = $1 ORDER BY issued_at DESC', [id]);
  const position = ['disbursed', 'closed'].includes(app.status) ? await loanPosition(id) : null;
  const schedule = position ? await many(
    `SELECT installment_number, due_date, principal_due, interest_due, total_due, amount_paid, status, paid_at
       FROM loan_installments WHERE application_id = $1 ORDER BY installment_number`, [id],
  ) : [];
  const isStaff = req.auth!.isStaff;
  const assessments = isStaff ? await many(
    `SELECT s.*, u.name AS assessor_name FROM application_assessments s LEFT JOIN users u ON u.id = s.assessed_by
      WHERE s.application_id = $1 ORDER BY s.created_at DESC`, [id],
  ) : [];
  const transactions = isStaff ? await many(
    `SELECT t.*, r.name AS recorded_by_name, c.name AS confirmed_by_name FROM loan_transactions t
       JOIN users r ON r.id = t.recorded_by LEFT JOIN users c ON c.id = t.confirmed_by
      WHERE t.application_id = $1 ORDER BY t.recorded_at DESC`, [id],
  ) : await many(
    `SELECT id, type, amount, value_date, channel, status, recorded_at FROM loan_transactions WHERE application_id = $1 AND status = 'confirmed' ORDER BY value_date DESC`, [id],
  );
  const names = await many<{ id: string; name: string }>('SELECT id, name FROM users WHERE id = ANY($1::text[])', [[app.recommended_by, app.decided_by].filter(Boolean)]);
  const nameOf = (userId: string | null) => names.find(item => item.id === userId)?.name ?? null;

  return {
    ...presentSummary(summary),
    purpose: app.purpose,
    declared: app.applicant_declared,
    interestRateMonthly: app.interest_rate ?? (app.status === 'draft' ? product.interest_rate_monthly : null),
    product: {
      id: product.id, name: product.name, category: product.category, interestMethod: app.product_snapshot?.interest_method ?? product.interest_method,
      repaymentFrequency: app.product_snapshot?.repayment_frequency ?? product.repayment_frequency,
      minAmount: product.min_amount, maxAmount: product.max_amount, minTermMonths: product.min_term_months, maxTermMonths: product.max_term_months,
      membersOnly: app.product_snapshot?.members_only ?? product.members_only, collateralRequired: product.collateral_required,
    },
    infoRequestNote: app.info_request_note,
    recommendation: isStaff ? app.recommendation : undefined,
    recommendationNote: isStaff ? app.recommendation_note : undefined,
    recommendedBy: isStaff ? nameOf(app.recommended_by) : undefined,
    decidedBy: nameOf(app.decided_by),
    decisionReason: app.decision_reason,
    approvedTermMonths: app.approved_term_months,
    disbursedAt: app.disbursed_at,
    closedAt: app.closed_at,
    requirements,
    eligibility,
    timeline: events.map(event => ({
      from: event.from_status, to: event.to_status, note: isStaff || ['info_requested', 'rejected', 'approved'].includes(event.to_status) ? event.note : null,
      at: event.created_at, actorName: isStaff ? event.actor_name : event.actor_role === 'customer' ? 'You' : 'Pinnacle',
    })),
    assessments: assessments.map(item => ({
      id: item.id, assessedBy: item.assessor_name, inputs: item.inputs, results: item.results, indicators: item.indicators,
      missingInformation: item.missing_information, officerSummary: item.officer_summary, createdAt: item.created_at,
    })),
    offers: offers.map(offer => ({
      id: offer.id, amount: offer.amount, termMonths: offer.term_months, interestRateMonthly: offer.interest_rate_monthly,
      interestMethod: offer.interest_method, repaymentFrequency: offer.repayment_frequency, fees: offer.fees, totalFees: offer.total_fees,
      installmentAmount: offer.installment_amount, totalRepayable: offer.total_repayable, schedule: offer.schedule,
      conditions: offer.conditions, status: offer.status, expiresAt: offer.expires_at, issuedAt: offer.issued_at, respondedAt: offer.responded_at,
    })),
    position,
    schedule: schedule.map(line => ({
      installmentNumber: line.installment_number, dueDate: line.due_date, principal: line.principal_due, interest: line.interest_due,
      total: line.total_due, paid: line.amount_paid, status: line.amount_paid >= line.total_due - 0.009 ? 'paid'
        : line.due_date < new Date().toISOString().slice(0, 10) ? 'overdue' : line.amount_paid > 0 ? 'partially_paid' : 'scheduled',
    })),
    transactions: transactions.map(item => ({
      id: item.id, type: item.type, amount: item.amount, valueDate: item.value_date, channel: item.channel, status: item.status,
      externalReference: isStaff ? item.external_reference : undefined, recordedBy: item.recorded_by_name, confirmedBy: item.confirmed_by_name,
      recordedAt: item.recorded_at, confirmedAt: item.confirmed_at, rejectionReason: item.rejection_reason, notes: isStaff ? item.notes : undefined,
    })),
    allowedActions: await allowedActions(req, app),
  };
}

applicationsRouter.get('/applications/:id', route(async (req, res) => {
  await assertApplicationAccess(req, req.params.id);
  const app = await one('SELECT status FROM loan_applications WHERE id = $1', [req.params.id]);
  if (req.auth!.isStaff && app.status === 'draft') throw notFound('Application not found.');
  res.json(await applicationDetail(req, req.params.id));
}));

// ── Applicant actions ────────────────────────────────────────────────────────

applicationsRouter.post('/applications/:id/submit', route(async (req, res) => {
  await assertApplicationAccess(req, req.params.id);
  if (req.auth!.role !== 'customer') assertPermission(req, 'customers.manage');
  const app = await loadApplication(req.params.id);
  if (!APPLICANT_EDITABLE.includes(app.status)) throw conflict('This application has already been submitted.');

  const product = (await getProduct(app.product_id))!;
  const problems: Array<{ field: string; message: string }> = [];
  if (!isAvailable(product)) problems.push({ field: 'productId', message: `${product.name} is not currently available.` });
  problems.push(...validateAgainstProduct(product, app.amount, app.term_months));

  if (product.members_only) {
    const eligibility = app.borrower_type === 'business' && app.business_id
      ? await businessEligibility(app.business_id, app.customer_id)
      : await individualEligibility(app.customer_id);
    for (const reason of eligibility.reasons) problems.push({ field: 'membership', message: reason });
  }
  if (app.borrower_type === 'individual' && app.applicant_declared.monthlyNetIncome === undefined) {
    problems.push({ field: 'declared.monthlyNetIncome', message: 'Enter your monthly net income.' });
  }
  if (app.borrower_type === 'business' && app.business_id) {
    const fin = await one('SELECT 1 FROM business_financials WHERE business_id = $1', [app.business_id]);
    if (!fin) problems.push({ field: 'financials', message: 'Add the business’s revenue and expenses before submitting.' });
    if (['invoice_discounting', 'order_financing'].includes(product.category) && app.applicant_declared.expectedProceeds === undefined) {
      problems.push({ field: 'declared.expectedProceeds', message: `Enter the ${product.category === 'invoice_discounting' ? 'invoice' : 'order'} value.` });
    }
  }
  const requirements = await documentRequirements({ ...app, required_documents: product.required_documents });
  for (const item of blockingForSubmission(requirements)) {
    problems.push({ field: `documents.${item.code}`, message: `${item.label} is ${item.status === 'missing' ? 'missing' : item.status}.` });
  }
  if (problems.length) throw unprocessable('This application is not ready to submit.', problems);

  const next = app.status === 'info_requested' && app.assigned_officer_id ? 'under_review' : 'submitted';
  await transaction(async client => {
    await transition(client, app, next, req, app.status === 'info_requested' ? 'Applicant provided the requested information' : 'Submitted by applicant',
      `submitted_at = COALESCE(submitted_at, now()), interest_rate = $4, interest_method = $5, product_snapshot = $6, info_request_note = NULL`,
      [product.interest_rate_monthly, product.interest_method, productSnapshot(product)]);
    await audit(req, { action: 'application.submit', entityType: 'application', entityId: app.id, summary: `Submitted application ${app.reference}.`, metadata: { amount: app.amount, termMonths: app.term_months } }, client);
    if (next === 'submitted') {
      await notifyStaffWithPermission('applications.assign', {
        type: 'action', title: 'New application to assign', body: `${app.reference}: ${product.name} for MWK ${app.amount.toLocaleString('en-US')}.`,
        actionRoute: `/staff/applications/${app.id}`, entityType: 'application', entityId: app.id,
      }, client);
    } else if (app.assigned_officer_id) {
      await notifyUser(app.assigned_officer_id, {
        type: 'action', title: 'Applicant responded', body: `${app.reference} has been updated by the applicant.`,
        actionRoute: `/staff/applications/${app.id}`, entityType: 'application', entityId: app.id,
      }, client);
    }
  });
  res.json(await applicationDetail(req, app.id));
}));

applicationsRouter.post('/applications/:id/withdraw', route(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().max(500).optional() }), req.body ?? {});
  await assertApplicationAccess(req, req.params.id);
  if (req.auth!.role !== 'customer') throw forbidden('Only the applicant can withdraw an application.');
  const app = await loadApplication(req.params.id);
  if (!['draft', ...PRE_DECISION, 'approved'].includes(app.status)) throw conflict('This application can no longer be withdrawn.');
  await transaction(async client => {
    await transition(client, app, 'withdrawn', req, reason || 'Withdrawn by applicant', 'withdrawn_at = now()');
    await audit(req, { action: 'application.withdraw', entityType: 'application', entityId: app.id, summary: `Withdrew application ${app.reference}.` }, client);
    if (app.assigned_officer_id) {
      await notifyUser(app.assigned_officer_id, { type: 'info', title: 'Application withdrawn', body: `${app.reference} was withdrawn by the applicant.`, actionRoute: `/staff/applications/${app.id}` }, client);
    }
  });
  res.json(await applicationDetail(req, app.id));
}));

// ── Staff workflow ───────────────────────────────────────────────────────────

async function staffApp(req: Request, id: string): Promise<ApplicationRow> {
  if (!req.auth!.isStaff) throw forbidden();
  await assertApplicationAccess(req, id);
  return loadApplication(id);
}

async function assertProductAccess(req: Request, productId: string) {
  const products = await loadProductAccess(req);
  if (products !== 'all' && !products.has(productId)) throw forbidden('You are not authorised to process this loan product.');
}

function assertAssignee(req: Request, app: ApplicationRow) {
  if (app.assigned_officer_id !== req.auth!.userId) throw forbidden('Only the officer assigned to this application can do this.');
}

applicationsRouter.post('/applications/:id/assign', route(async (req, res) => {
  const { officerId } = parse(z.object({ officerId: z.string().min(1).max(100) }), req.body);
  assertPermission(req, 'applications.assign');
  const app = await staffApp(req, req.params.id);
  await assertProductAccess(req, app.product_id);
  if (!PRE_DECISION.includes(app.status)) throw conflict('Only applications that are still being reviewed can be reassigned.');

  const officer = await one(`SELECT id, name, role, is_active FROM users WHERE id = $1 AND role <> 'customer'`, [officerId]);
  if (!officer || !officer.is_active) throw badRequest('Choose an active staff member.');
  const permissions = await loadEffectivePermissions(officer.id, officer.role);
  if (!permissions.has('applications.assess')) throw unprocessable(`${officer.name} is not authorised to assess applications.`);
  if (!permissions.has('applications.all_products')) {
    const access = await one('SELECT 1 FROM user_product_access WHERE user_id = $1 AND product_id = $2', [officer.id, app.product_id]);
    if (!access) throw unprocessable(`${officer.name} is not authorised for this loan product.`);
  }

  await transaction(async client => {
    if (app.status === 'submitted') {
      await transition(client, app, 'under_review', req, `Assigned to ${officer.name}`, 'assigned_officer_id = $4, assigned_by = $5, assigned_at = now()', [officer.id, req.auth!.userId]);
    } else {
      await client.query('UPDATE loan_applications SET assigned_officer_id = $2, assigned_by = $3, assigned_at = now(), updated_at = now() WHERE id = $1', [app.id, officer.id, req.auth!.userId]);
      await client.query(
        `INSERT INTO application_events (application_id, from_status, to_status, actor_id, actor_role, note) VALUES ($1, $2, $2, $3, $4, $5)`,
        [app.id, app.status, req.auth!.userId, req.auth!.role, `Reassigned to ${officer.name}`],
      );
    }
    await audit(req, { action: 'application.assign', entityType: 'application', entityId: app.id, summary: `Assigned ${app.reference} to ${officer.name}.`, metadata: { from: app.assigned_officer_id, to: officer.id } }, client);
    if (officer.id !== req.auth!.userId) {
      await notifyUser(officer.id, { type: 'action', title: 'Application assigned to you', body: `${app.reference} is ready for review.`, actionRoute: `/staff/applications/${app.id}`, entityType: 'application', entityId: app.id }, client);
    }
  });
  res.json(await applicationDetail(req, app.id));
}));

applicationsRouter.post('/applications/:id/request-info', route(async (req, res) => {
  const { note } = parse(z.object({ note: z.string().trim().min(5, 'Say what the applicant needs to provide.').max(2000) }), req.body);
  assertPermission(req, 'applications.request_info');
  const app = await staffApp(req, req.params.id);
  assertAssignee(req, app);
  if (!['under_review', 'assessed', 'recommended'].includes(app.status)) throw conflict('Information can only be requested while the application is under review.');
  await transaction(async client => {
    await transition(client, app, 'info_requested', req, note, 'info_request_note = $4, recommendation = NULL, recommended_by = NULL, recommended_at = NULL, recommendation_note = NULL', [note]);
    await audit(req, { action: 'application.request_info', entityType: 'application', entityId: app.id, summary: `Requested more information on ${app.reference}.`, metadata: { note } }, client);
    await notifyApplicants(app, 'More information needed', note, 'action', client);
  });
  res.json(await applicationDetail(req, app.id));
}));

const overrideSchema = z.object({ value: z.number().min(0).max(1e13), note: z.string().trim().min(3).max(500), evidenceDocumentId: z.string().max(100).optional() });
const assessSchema = z.object({
  overrides: z.record(z.string(), overrideSchema).default({}),
  officerSummary: z.string().trim().min(10, 'Summarise your assessment.').max(5000),
});

applicationsRouter.post('/applications/:id/assess', route(async (req, res) => {
  const input = parse(assessSchema, req.body);
  assertPermission(req, 'applications.assess');
  const app = await staffApp(req, req.params.id);
  assertAssignee(req, app);
  if (!['under_review', 'assessed'].includes(app.status)) throw conflict('This application is not at the assessment stage.');
  for (const [key, override] of Object.entries(input.overrides)) {
    if (!override.evidenceDocumentId) throw badRequest(`Verified figure "${key}" must reference the document it was checked against.`);
    const doc = await one(
      `SELECT status FROM documents WHERE id = $1 AND deleted_at IS NULL AND (application_id = $2 OR customer_id = $3 OR ($4::text IS NOT NULL AND business_id = $4))`,
      [override.evidenceDocumentId, app.id, app.customer_id, app.business_id],
    );
    if (!doc) throw badRequest(`The evidence for "${key}" must be a document attached to this application, applicant or business.`);
    if (doc.status !== 'verified') throw unprocessable(`Verify the evidence document for "${key}" first.`);
  }
  const product = (await getProduct(app.product_id))!;
  const effectiveProduct = { ...product, ...(app.interest_rate !== null ? { interest_rate_monthly: app.interest_rate } : {}) };
  const output = await runAssessment(app, effectiveProduct, input.overrides);
  const id = newId('asm');
  await transaction(async client => {
    await client.query(
      `INSERT INTO application_assessments (id, application_id, assessed_by, inputs, results, indicators, missing_information, officer_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, app.id, req.auth!.userId, { ...output.inputs, overrides: input.overrides }, { ...output.results, scenarios: output.scenarios, thresholdsConfirmed: output.thresholdsConfirmed },
        JSON.stringify(output.indicators), JSON.stringify(output.missingInformation), input.officerSummary],
    );
    if (app.status === 'under_review') await transition(client, app, 'assessed', req, 'Assessment recorded');
    await audit(req, { action: 'application.assess', entityType: 'application', entityId: app.id, summary: `Recorded assessment for ${app.reference}.`, metadata: { assessmentId: id, indicators: output.indicators.map(item => item.code) } }, client);
  });
  res.status(201).json({ assessment: { id, ...output }, application: await applicationDetail(req, app.id) });
}));

/** Preview the calculations without saving (for the officer's assessment form). */
applicationsRouter.post('/applications/:id/assessment-preview', route(async (req, res) => {
  const input = parse(z.object({ overrides: z.record(z.string(), overrideSchema.partial({ note: true })).default({}) }), req.body ?? {});
  assertPermission(req, 'applications.assess');
  const app = await staffApp(req, req.params.id);
  const product = (await getProduct(app.product_id))!;
  const effectiveProduct = { ...product, ...(app.interest_rate !== null ? { interest_rate_monthly: app.interest_rate } : {}) };
  const overrides = Object.fromEntries(Object.entries(input.overrides).map(([key, value]) => [key, { value: value.value, note: value.note ?? '' }]));
  res.json(await runAssessment(app, effectiveProduct, overrides));
}));

applicationsRouter.post('/applications/:id/recommend', route(async (req, res) => {
  const input = parse(z.object({ recommendation: z.enum(['approve', 'decline']), note: z.string().trim().min(10).max(5000) }), req.body);
  assertPermission(req, 'applications.recommend');
  const app = await staffApp(req, req.params.id);
  assertAssignee(req, app);
  if (app.status !== 'assessed') throw conflict('Record an assessment before making a recommendation.');
  await transaction(async client => {
    await transition(client, app, 'recommended', req, `Recommended to ${input.recommendation}: ${input.note}`,
      'recommendation = $4, recommendation_note = $5, recommended_by = $6, recommended_at = now()', [input.recommendation, input.note, req.auth!.userId]);
    await audit(req, { action: 'application.recommend', entityType: 'application', entityId: app.id, summary: `Recommended ${input.recommendation} for ${app.reference}.`, metadata: { recommendation: input.recommendation } }, client);
    await notifyStaffWithPermission('applications.approve', {
      type: 'action', title: 'Application awaiting decision', body: `${app.reference} is recommended for ${input.recommendation === 'approve' ? 'approval' : 'decline'}.`,
      actionRoute: `/staff/applications/${app.id}`, entityType: 'application', entityId: app.id,
    }, client);
  });
  res.json(await applicationDetail(req, app.id));
}));

const approveSchema = z.object({
  approvedAmount: z.number().positive().max(1e13).optional(),
  approvedTermMonths: z.number().int().min(1).max(360).optional(),
  reason: z.string().trim().min(10, 'Record the reason for this decision.').max(5000),
});

applicationsRouter.post('/applications/:id/approve', route(async (req, res) => {
  const input = parse(approveSchema, req.body);
  assertPermission(req, 'applications.approve');
  const app = await staffApp(req, req.params.id);
  await assertProductAccess(req, app.product_id);
  if (app.status !== 'recommended') throw conflict('Only recommended applications can be approved.');
  const auth = req.auth!;
  const workflow = await getSetting<WorkflowSettings>('workflow');
  const latestAssessment = await one('SELECT assessed_by FROM application_assessments WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1', [app.id]);
  if (workflow.requireSeparationOfDuties && [app.recommended_by, app.assigned_officer_id, latestAssessment?.assessed_by].includes(auth.userId)) {
    throw forbidden('Separation of duties: the person who assessed or recommended an application cannot approve it.');
  }
  const amount = input.approvedAmount ?? app.amount;
  const term = input.approvedTermMonths ?? app.term_months;
  if (amount > app.amount) throw badRequest('The approved amount cannot exceed the amount requested.');
  const limit = auth.approvalLimit;
  if (!(auth.role === 'admin' && limit === null) && (limit === null || amount > limit)) {
    throw forbidden(limit === null ? 'You do not have an approval limit. Ask an administrator to set one.' : `This exceeds your approval limit of MWK ${limit.toLocaleString('en-US')}.`);
  }
  const product = (await getProduct(app.product_id))!;
  const limitsProduct = { ...product, ...(app.product_snapshot ? {
    min_amount: app.product_snapshot.min_amount, max_amount: app.product_snapshot.max_amount,
    min_term_months: app.product_snapshot.min_term_months, max_term_months: app.product_snapshot.max_term_months,
  } : {}) };
  const limitProblems = validateAgainstProduct(limitsProduct, amount, term);
  if (limitProblems.length) throw badRequest('The approved terms are outside the product limits.', limitProblems);

  const blockers: Array<{ field: string; message: string }> = [];
  const requirements = await documentRequirements(app);
  for (const item of blockingForApproval(requirements)) blockers.push({ field: `documents.${item.code}`, message: `${item.label} has not been verified (${item.status}).` });
  if (app.product_snapshot?.members_only) {
    const eligibility = app.borrower_type === 'business' && app.business_id ? await businessEligibility(app.business_id, app.customer_id) : await individualEligibility(app.customer_id);
    for (const reason of eligibility.reasons) blockers.push({ field: 'membership', message: reason });
  }
  if (app.business_id) {
    const business = await one('SELECT verification_status FROM businesses WHERE id = $1', [app.business_id]);
    if (business.verification_status !== 'verified') blockers.push({ field: 'business', message: 'The business profile has not been verified.' });
  }
  if (!latestAssessment) blockers.push({ field: 'assessment', message: 'No assessment has been recorded.' });
  if (blockers.length) throw unprocessable('This application cannot be approved yet.', blockers);

  await transaction(async client => {
    await transition(client, app, 'approved', req, input.reason,
      'decided_by = $4, decided_at = now(), decision_reason = $5, approved_amount = $6, approved_term_months = $7',
      [auth.userId, input.reason, amount, term]);
    await audit(req, {
      action: 'application.approve', entityType: 'application', entityId: app.id, summary: `Approved ${app.reference} for MWK ${amount.toLocaleString('en-US')} over ${term} months.`,
      metadata: { amount, term, requested: app.amount, recommendation: app.recommendation, followedRecommendation: app.recommendation === 'approve' },
    }, client);
    await notifyApplicants(app, 'Application approved', `Your application ${app.reference} has been approved. We will send you a loan offer to review.`, 'success', client);
  });
  res.json(await applicationDetail(req, app.id));
}));

applicationsRouter.post('/applications/:id/reject', route(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(10, 'Record the reason for this decision.').max(5000) }), req.body);
  assertPermission(req, 'applications.reject');
  const app = await staffApp(req, req.params.id);
  await assertProductAccess(req, app.product_id);
  if (!['under_review', 'assessed', 'recommended'].includes(app.status)) throw conflict('This application cannot be rejected at its current stage.');
  const workflow = await getSetting<WorkflowSettings>('workflow');
  if (workflow.requireSeparationOfDuties && app.recommended_by === req.auth!.userId) {
    throw forbidden('Separation of duties: the officer who made the recommendation cannot also make the decision.');
  }
  await transaction(async client => {
    await transition(client, app, 'rejected', req, reason, 'decided_by = $4, decided_at = now(), decision_reason = $5', [req.auth!.userId, reason]);
    await audit(req, { action: 'application.reject', entityType: 'application', entityId: app.id, summary: `Rejected ${app.reference}.`, metadata: { reason, recommendation: app.recommendation } }, client);
    await notifyApplicants(app, 'Application decision', `Your application ${app.reference} was not approved. Reason: ${reason}`, 'warning', client);
  });
  res.json(await applicationDetail(req, app.id));
}));

// ── Offers ───────────────────────────────────────────────────────────────────

applicationsRouter.post('/applications/:id/offer', route(async (req, res) => {
  const { conditions } = parse(z.object({ conditions: z.string().trim().max(3000).optional() }), req.body ?? {});
  assertPermission(req, 'offers.prepare');
  const app = await staffApp(req, req.params.id);
  await assertProductAccess(req, app.product_id);
  if (app.status !== 'approved') throw conflict('An offer can only be issued for an approved application.');
  const snapshot = app.product_snapshot!;
  const quote = quoteLoan({
    principal: app.approved_amount!, termMonths: app.approved_term_months!, monthlyRatePct: Number(app.interest_rate),
    interestMethod: snapshot.interest_method, repaymentFrequency: snapshot.repayment_frequency, fees: snapshot.fees,
    startDate: new Date().toISOString().slice(0, 10),
  });
  const workflow = await getSetting<WorkflowSettings>('workflow');
  const offerId = newId('ofr');
  const expiresAt = new Date(Date.now() + workflow.offerValidityDays * 86_400_000);
  await transaction(async client => {
    await client.query(
      `INSERT INTO loan_offers (id, application_id, amount, term_months, interest_method, interest_rate_monthly, repayment_frequency, fees,
                                total_fees, installment_amount, total_repayable, schedule, conditions, expires_at, issued_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [offerId, app.id, quote.principal, quote.termMonths, quote.interestMethod, quote.monthlyRatePct, quote.repaymentFrequency,
        JSON.stringify(quote.fees), quote.totalFees, quote.installmentAmount, quote.totalRepayable,
        JSON.stringify({ lines: quote.schedule, netDisbursement: quote.netDisbursement, note: 'Due dates are provisional and are fixed from the disbursement date.' }),
        conditions ?? null, expiresAt, req.auth!.userId],
    );
    await transition(client, app, 'offer_issued', req, 'Loan offer issued');
    await audit(req, { action: 'offer.issue', entityType: 'application', entityId: app.id, summary: `Issued offer for ${app.reference}.`, metadata: { offerId, totalRepayable: quote.totalRepayable } }, client);
    await notifyApplicants(app, 'Your loan offer is ready', `Review and respond to the offer for ${app.reference} before ${expiresAt.toDateString()}.`, 'action', client);
  });
  res.status(201).json(await applicationDetail(req, app.id));
}));

applicationsRouter.post('/applications/:id/offer/respond', route(async (req, res) => {
  const { accept, reason } = parse(z.object({ accept: z.boolean(), reason: z.string().trim().max(500).optional() }), req.body);
  await assertApplicationAccess(req, req.params.id);
  if (req.auth!.role !== 'customer') throw forbidden('Only the applicant can respond to an offer.');
  const app = await loadApplication(req.params.id);
  if (app.status !== 'offer_issued') throw conflict('There is no open offer on this application.');
  const offer = await one(`SELECT * FROM loan_offers WHERE application_id = $1 AND status = 'issued'`, [app.id]);
  if (!offer) throw conflict('There is no open offer on this application.');
  if (new Date(offer.expires_at).getTime() < Date.now()) throw conflict('This offer has expired. Contact your branch for a new one.');
  await transaction(async client => {
    await client.query(`UPDATE loan_offers SET status = $2, responded_by = $3, responded_at = now() WHERE id = $1`, [offer.id, accept ? 'accepted' : 'declined', req.auth!.userId]);
    await transition(client, app, accept ? 'offer_accepted' : 'offer_declined', req, accept ? 'Offer accepted by applicant' : `Offer declined${reason ? `: ${reason}` : ''}`);
    await audit(req, { action: accept ? 'offer.accept' : 'offer.decline', entityType: 'application', entityId: app.id, summary: `Applicant ${accept ? 'accepted' : 'declined'} the offer for ${app.reference}.`, metadata: { offerId: offer.id } }, client);
    if (app.assigned_officer_id) {
      await notifyUser(app.assigned_officer_id, { type: accept ? 'action' : 'info', title: accept ? 'Offer accepted' : 'Offer declined', body: `${app.reference}: the applicant ${accept ? 'accepted' : 'declined'} the offer.`, actionRoute: `/staff/applications/${app.id}` }, client);
    }
  });
  res.json(await applicationDetail(req, app.id));
}));

export { applicationDetail };
