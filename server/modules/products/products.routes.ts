import { Router } from 'express';
import { z } from 'zod';
import { many, transaction } from '../../db/pool';
import { audit } from '../../lib/audit';
import { badRequest, notFound, parse, route, unprocessable } from '../../lib/http';
import { newId } from '../../lib/ids';
import { quoteLoan } from '../../lib/loanMath';
import { hasPermission, requirePermission } from '../../auth/permissions';
import { activationBlockers, getProduct, isAvailable, listProducts, presentProduct, validateAgainstProduct, type ProductRow } from './products.service';

export const productsRouter = Router();

productsRouter.get('/products', route(async (req, res) => {
  const auth = req.auth!;
  if (!auth.isStaff) {
    res.json((await listProducts({ onlyAvailable: true })).map(row => presentProduct(row)));
    return;
  }
  const includeAdmin = hasPermission(req, 'products.manage');
  res.json((await listProducts()).map(row => presentProduct(row, { includeAdmin })));
}));

productsRouter.get('/products/:id', route(async (req, res) => {
  const product = await getProduct(req.params.id);
  if (!product || (!req.auth!.isStaff && !isAvailable(product))) throw notFound('Product not found.');
  res.json(presentProduct(product, { includeAdmin: hasPermission(req, 'products.manage') }));
}));

const feeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.enum(['fixed', 'percent']),
  value: z.number().nonnegative().max(1e12),
  deductedFromDisbursement: z.boolean(),
}).refine(fee => fee.type !== 'percent' || fee.value <= 100, { message: 'A percentage fee cannot exceed 100%.' });

const productFields = {
  name: z.string().trim().min(3).max(150),
  description: z.string().trim().max(2000),
  minAmount: z.number().positive().max(1e13).nullable(),
  maxAmount: z.number().positive().max(1e13).nullable(),
  minTermMonths: z.number().int().min(1).max(360).nullable(),
  maxTermMonths: z.number().int().min(1).max(360).nullable(),
  interestMethod: z.enum(['flat', 'reducing_balance']),
  interestRateMonthly: z.number().min(0).max(100).nullable(),
  repaymentFrequency: z.enum(['monthly', 'bullet']),
  fees: z.array(feeSchema).max(20),
  requiredDocuments: z.array(z.string().max(50)).max(30),
  membersOnly: z.boolean(),
  collateralRequired: z.boolean(),
  collateralNotes: z.string().trim().max(1000).nullable(),
  termsConfirmed: z.boolean(),
  effectiveFrom: z.iso.date().nullable(),
  effectiveTo: z.iso.date().nullable(),
};

const createSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{3,50}$/, 'Use 3–50 letters, digits or underscores.'),
  category: z.enum(['payroll', 'personal', 'working_capital', 'enterprise', 'asset_financing', 'invoice_discounting', 'order_financing']),
  borrowerType: z.enum(['individual', 'business']),
  ...productFields,
}).partial({
  description: true, minAmount: true, maxAmount: true, minTermMonths: true, maxTermMonths: true, interestRateMonthly: true,
  fees: true, requiredDocuments: true, membersOnly: true, collateralRequired: true, collateralNotes: true, termsConfirmed: true,
  effectiveFrom: true, effectiveTo: true, interestMethod: true, repaymentFrequency: true,
});

const updateSchema = z.object({
  ...productFields,
  status: z.enum(['draft', 'active', 'suspended', 'retired']),
}).partial().strict();

async function assertDocumentCodes(codes: string[] | undefined): Promise<void> {
  if (!codes?.length) return;
  const found = await many<{ code: string }>('SELECT code FROM document_types WHERE code = ANY($1::text[])', [codes]);
  const unknown = codes.filter(code => !found.some(row => row.code === code));
  if (unknown.length) throw badRequest(`Unknown document types: ${unknown.join(', ')}.`);
}

const COLUMN_FOR: Record<string, string> = {
  name: 'name', description: 'description', minAmount: 'min_amount', maxAmount: 'max_amount',
  minTermMonths: 'min_term_months', maxTermMonths: 'max_term_months', interestMethod: 'interest_method',
  interestRateMonthly: 'interest_rate_monthly', repaymentFrequency: 'repayment_frequency', fees: 'fees',
  requiredDocuments: 'required_documents', membersOnly: 'members_only', collateralRequired: 'collateral_required',
  collateralNotes: 'collateral_notes', termsConfirmed: 'terms_confirmed', effectiveFrom: 'effective_from',
  effectiveTo: 'effective_to', status: 'status',
};

productsRouter.post('/products', requirePermission('products.manage'), route(async (req, res) => {
  const input = parse(createSchema, req.body);
  await assertDocumentCodes(input.requiredDocuments);
  const id = newId('prd');
  await transaction(async client => {
    await client.query(
      `INSERT INTO loan_products (id, code, name, category, borrower_type, description, min_amount, max_amount, min_term_months,
                                  max_term_months, interest_method, interest_rate_monthly, repayment_frequency, fees, required_documents,
                                  members_only, collateral_required, collateral_notes, terms_confirmed, effective_from, effective_to,
                                  status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'draft',$22,$22)`,
      [id, input.code, input.name, input.category, input.borrowerType, input.description ?? '', input.minAmount ?? null,
        input.maxAmount ?? null, input.minTermMonths ?? null, input.maxTermMonths ?? null, input.interestMethod ?? 'reducing_balance',
        input.interestRateMonthly ?? null, input.repaymentFrequency ?? 'monthly', JSON.stringify(input.fees ?? []),
        input.requiredDocuments ?? [], input.membersOnly ?? input.borrowerType === 'business', input.collateralRequired ?? false,
        input.collateralNotes ?? null, input.termsConfirmed ?? false, input.effectiveFrom ?? null, input.effectiveTo ?? null,
        req.auth!.userId],
    );
    await audit(req, { action: 'product.create', entityType: 'loan_product', entityId: id, summary: `Created draft product ${input.name}.`, metadata: { code: input.code } }, client);
  });
  res.status(201).json(presentProduct((await getProduct(id))!, { includeAdmin: true }));
}));

productsRouter.patch('/products/:id', requirePermission('products.manage'), route(async (req, res) => {
  const input = parse(updateSchema, req.body);
  const existing = await getProduct(req.params.id);
  if (!existing) throw notFound('Product not found.');
  await assertDocumentCodes(input.requiredDocuments);

  // Validate the product as it will look after the change.
  const next = { ...existing } as ProductRow & Record<string, unknown>;
  for (const [key, value] of Object.entries(input)) next[COLUMN_FOR[key]] = value as never;
  if (next.status === 'active') {
    const blockers = activationBlockers(next);
    if (blockers.length) throw unprocessable('This product cannot be active yet.', blockers.map(message => ({ field: 'status', message })));
  }
  if (next.min_amount !== null && next.max_amount !== null && next.min_amount > next.max_amount) throw badRequest('Minimum amount is above the maximum.');
  if (next.min_term_months !== null && next.max_term_months !== null && next.min_term_months > next.max_term_months) throw badRequest('Minimum term is above the maximum.');

  const entries = Object.entries(input);
  if (!entries.length) throw badRequest('Nothing to update.');
  const sets = entries.map(([key], index) => `${COLUMN_FOR[key]} = $${index + 2}`);
  const values = entries.map(([key, value]) => (key === 'fees' ? JSON.stringify(value) : value));
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of entries) {
    const before = (existing as any)[COLUMN_FOR[key]];
    if (JSON.stringify(before) !== JSON.stringify(value)) changes[key] = { from: before, to: value };
  }

  await transaction(async client => {
    await client.query(
      `UPDATE loan_products SET ${sets.join(', ')}, updated_by = $${entries.length + 2}, updated_at = now() WHERE id = $1`,
      [existing.id, ...values, req.auth!.userId],
    );
    const statusChange = input.status && input.status !== existing.status;
    await audit(req, {
      action: statusChange ? `product.${input.status === 'active' ? 'activate' : input.status}` : 'product.update',
      entityType: 'loan_product', entityId: existing.id,
      summary: `Updated product ${existing.name}${statusChange ? ` (status ${existing.status} → ${input.status})` : ''}.`,
      metadata: { changes },
    }, client);
  });
  res.json(presentProduct((await getProduct(existing.id))!, { includeAdmin: true }));
}));

const quoteSchema = z.object({
  amount: z.number().positive().max(1e13),
  termMonths: z.number().int().min(1).max(360),
  startDate: z.iso.date().optional(),
});

/** Repayment estimate using the product's configured terms. Nothing is invented: products without a rate cannot be quoted. */
productsRouter.post('/products/:id/quote', route(async (req, res) => {
  const input = parse(quoteSchema, req.body);
  const product = await getProduct(req.params.id);
  if (!product || (!req.auth!.isStaff && !isAvailable(product))) throw notFound('Product not found.');
  if (product.interest_rate_monthly === null) throw unprocessable('This product has no approved interest rate yet, so a repayment estimate is not available.');
  const problems = validateAgainstProduct(product, input.amount, input.termMonths);
  if (problems.length) throw badRequest('The amount or term is outside this product’s limits.', problems);
  const quote = quoteLoan({
    principal: input.amount,
    termMonths: input.termMonths,
    monthlyRatePct: product.interest_rate_monthly,
    interestMethod: product.interest_method,
    repaymentFrequency: product.repayment_frequency,
    fees: product.fees,
    startDate: input.startDate ?? new Date().toISOString().slice(0, 10),
  });
  res.json({ ...quote, isEstimate: true, productId: product.id });
}));

// Small helper used by the settings screen to show configured document requirements.
productsRouter.get('/products/:id/requirements', route(async (req, res) => {
  const product = await getProduct(req.params.id);
  if (!product || (!req.auth!.isStaff && !isAvailable(product))) throw notFound('Product not found.');
  const types = await many('SELECT code, label, owner_scope FROM document_types WHERE code = ANY($1::text[])', [product.required_documents]);
  res.json({
    documents: product.required_documents.map(code => {
      const type = types.find(row => row.code === code);
      return { code, label: type?.label ?? code, ownerScope: type?.owner_scope ?? 'any' };
    }),
    membersOnly: product.members_only,
    collateralRequired: product.collateral_required,
    collateralNotes: product.collateral_notes,
  });
}));

/** Products open for applications, for the public landing page. Only published fields. */
export const publicProductsRouter = Router();
publicProductsRouter.get('/products', route(async (_req, res) => {
  res.json((await listProducts({ onlyAvailable: true })).map(row => presentProduct(row)));
}));
