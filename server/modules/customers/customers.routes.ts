import { Router } from 'express';
import { z } from 'zod';
import { many, one, transaction } from '../../db/pool';
import { audit } from '../../lib/audit';
import { badRequest, conflict, forbidden, notFound, parse, route } from '../../lib/http';
import { newId } from '../../lib/ids';
import { assertCustomerAccess } from '../../auth/access';
import { requirePermission } from '../../auth/permissions';
import { individualEligibility } from '../members/eligibility';

export const customersRouter = Router();

const pageSchema = z.object({
  search: z.string().trim().max(100).optional(),
  segment: z.enum(['individual', 'sme']).optional(),
  membership: z.enum(['member', 'pending', 'none']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  sort: z.enum(['name', 'created_at']).default('created_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

function presentCustomer(row: any) {
  return {
    id: row.id,
    fullName: row.name,
    nationalId: row.national_id,
    phone: row.phone,
    email: row.email,
    district: row.location,
    segment: row.segment,
    employerName: row.employer_name,
    employeeNumber: row.employee_number,
    monthlyIncome: row.monthly_income,
    hasPortalAccount: Boolean(row.user_id),
    createdAt: row.created_at,
    isDemo: row.data_source !== 'live',
    membership: row.member_id
      ? { id: row.member_id, memberNumber: row.member_number, status: row.member_status, verifiedAt: row.member_verified_at, joinedOn: row.joined_on }
      : null,
    applicationCount: row.application_count ?? undefined,
  };
}

customersRouter.get('/customers', requirePermission('customers.view'), route(async (req, res) => {
  const input = parse(pageSchema, req.query);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (input.search) {
    params.push(`%${input.search.toLowerCase()}%`);
    conditions.push(`(lower(c.name) LIKE $${params.length} OR lower(c.national_id) LIKE $${params.length}
                      OR lower(c.phone) LIKE $${params.length} OR lower(m.member_number) LIKE $${params.length}
                      OR lower(c.email) LIKE $${params.length})`);
  }
  if (input.segment) { params.push(input.segment); conditions.push(`c.segment = $${params.length}`); }
  if (input.membership === 'member') conditions.push(`m.status = 'active'`);
  if (input.membership === 'pending') conditions.push(`m.status = 'pending'`);
  if (input.membership === 'none') conditions.push('m.id IS NULL');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const order = input.sort === 'name' ? 'lower(c.name)' : 'c.created_at';

  const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM customers c LEFT JOIN members m ON m.customer_id = c.id ${where}`, params);
  params.push(input.pageSize, (input.page - 1) * input.pageSize);
  const rows = await many(
    `SELECT c.*, m.id AS member_id, m.member_number, m.status AS member_status, m.verified_at AS member_verified_at, m.joined_on,
            (SELECT count(*)::int FROM loan_applications a WHERE a.customer_id = c.id AND a.status <> 'draft') AS application_count
       FROM customers c LEFT JOIN members m ON m.customer_id = c.id
       ${where}
      ORDER BY ${order} ${input.direction === 'asc' ? 'ASC' : 'DESC'}, c.id
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({ items: rows.map(presentCustomer), total: total?.n ?? 0, page: input.page, pageSize: input.pageSize });
}));

customersRouter.get('/customers/:id', route(async (req, res) => {
  await assertCustomerAccess(req, req.params.id);
  const row = await one(
    `SELECT c.*, m.id AS member_id, m.member_number, m.status AS member_status, m.verified_at AS member_verified_at, m.joined_on
       FROM customers c LEFT JOIN members m ON m.customer_id = c.id WHERE c.id = $1`,
    [req.params.id],
  );
  if (!row) throw notFound('Customer not found.');
  const businesses = await many(
    `SELECT b.id, b.registered_name, b.verification_status, p.role, p.verified
       FROM business_parties p JOIN businesses b ON b.id = p.business_id WHERE p.customer_id = $1 ORDER BY b.registered_name`,
    [row.id],
  );
  const applications = await many(
    `SELECT a.id, a.reference, a.status, a.amount, a.term_months, a.submitted_at, a.created_at, p.name AS product_name, a.borrower_type
       FROM loan_applications a LEFT JOIN loan_products p ON p.id = a.product_id
      WHERE a.customer_id = $1 ORDER BY a.created_at DESC LIMIT 50`,
    [row.id],
  );
  res.json({
    ...presentCustomer(row),
    address: row.address,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    employmentType: row.employment_type,
    eligibility: await individualEligibility(row.id),
    businesses: businesses.map(item => ({ id: item.id, name: item.registered_name, verificationStatus: item.verification_status, role: item.role, linkVerified: item.verified })),
    applications: applications.map(item => ({
      id: item.id, reference: item.reference, status: item.status, amount: item.amount, termMonths: item.term_months,
      productName: item.product_name, borrowerType: item.borrower_type, submittedAt: item.submitted_at, createdAt: item.created_at,
    })),
  });
}));

const customerSchema = z.object({
  fullName: z.string().trim().min(3).max(255),
  nationalId: z.string().trim().min(5).max(100),
  phone: z.string().trim().min(7).max(50),
  email: z.email().optional().or(z.literal('').transform(() => undefined)),
  district: z.string().trim().max(100).optional(),
  address: z.string().trim().max(500).optional(),
  dateOfBirth: z.iso.date().optional(),
  gender: z.string().trim().max(30).optional(),
  employmentType: z.string().trim().max(50).optional(),
  employerName: z.string().trim().max(255).optional(),
  employeeNumber: z.string().trim().max(100).optional(),
  monthlyIncome: z.number().nonnegative().max(1e12).optional(),
  segment: z.enum(['individual', 'sme']).default('individual'),
});

async function insertCustomer(input: z.infer<typeof customerSchema>, createdBy: string, client: any): Promise<string> {
  const id = newId('cus');
  await client.query(
    `INSERT INTO customers (id, name, national_id, phone, email, location, address, date_of_birth, gender, employment_type,
                            employer_name, employee_number, monthly_income, segment, status, is_activated, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Active',FALSE,$15)`,
    [id, input.fullName, input.nationalId, input.phone, input.email?.toLowerCase() ?? null, input.district ?? null,
      input.address ?? null, input.dateOfBirth ?? null, input.gender ?? null, input.employmentType ?? null,
      input.employerName ?? null, input.employeeNumber ?? null, input.monthlyIncome ?? null, input.segment, createdBy],
  );
  return id;
}

customersRouter.post('/customers', requirePermission('customers.manage'), route(async (req, res) => {
  const input = parse(customerSchema, req.body);
  const duplicate = await one('SELECT id FROM customers WHERE upper(national_id) = upper($1)', [input.nationalId]);
  if (duplicate) throw conflict('A customer with this national ID already exists.', { existingCustomerId: duplicate.id });
  const id = await transaction(async client => {
    const created = await insertCustomer(input, req.auth!.userId, client);
    await audit(req, { action: 'customer.create', entityType: 'customer', entityId: created, summary: `Added customer ${input.fullName}.` }, client);
    return created;
  });
  res.status(201).json({ id });
}));

customersRouter.patch('/customers/:id', requirePermission('customers.manage'), route(async (req, res) => {
  const input = parse(customerSchema.partial().strict(), req.body);
  const existing = await one('SELECT id, name FROM customers WHERE id = $1', [req.params.id]);
  if (!existing) throw notFound('Customer not found.');
  if (input.nationalId) {
    const clash = await one('SELECT id FROM customers WHERE upper(national_id) = upper($1) AND id <> $2', [input.nationalId, existing.id]);
    if (clash) throw conflict('Another customer already has this national ID.');
  }
  const map: Record<string, string> = {
    fullName: 'name', nationalId: 'national_id', phone: 'phone', email: 'email', district: 'location', address: 'address',
    dateOfBirth: 'date_of_birth', gender: 'gender', employmentType: 'employment_type', employerName: 'employer_name',
    employeeNumber: 'employee_number', monthlyIncome: 'monthly_income', segment: 'segment',
  };
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (!entries.length) throw badRequest('Nothing to update.');
  await transaction(async client => {
    await client.query(
      `UPDATE customers SET ${entries.map(([key], index) => `${map[key]} = $${index + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
      [existing.id, ...entries.map(([, value]) => value)],
    );
    await audit(req, { action: 'customer.update', entityType: 'customer', entityId: existing.id, summary: `Updated customer ${existing.name}.`, metadata: { fields: entries.map(([key]) => key) } }, client);
  });
  res.json({ id: existing.id });
}));

/** Bulk import from a spreadsheet parsed in the browser. Each row is validated; valid rows are saved, invalid rows reported. */
customersRouter.post('/customers/import', requirePermission('customers.manage'), route(async (req, res) => {
  const { rows } = parse(z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(1000) }), req.body);
  const results: Array<{ row: number; status: 'created' | 'skipped' | 'invalid'; message?: string; id?: string }> = [];
  await transaction(async client => {
    for (const [index, raw] of rows.entries()) {
      const parsed = customerSchema.safeParse({ ...raw, monthlyIncome: raw.monthlyIncome === undefined || raw.monthlyIncome === '' ? undefined : Number(raw.monthlyIncome) });
      if (!parsed.success) {
        results.push({ row: index + 1, status: 'invalid', message: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
        continue;
      }
      const duplicate = await one('SELECT id FROM customers WHERE upper(national_id) = upper($1)', [parsed.data.nationalId], client);
      if (duplicate) {
        results.push({ row: index + 1, status: 'skipped', message: 'National ID already registered.', id: duplicate.id });
        continue;
      }
      const id = await insertCustomer(parsed.data, req.auth!.userId, client);
      results.push({ row: index + 1, status: 'created', id });
    }
    const created = results.filter(item => item.status === 'created').length;
    await audit(req, { action: 'customer.import', entityType: 'customer', summary: `Imported ${created} of ${rows.length} customer rows.`, metadata: { created, total: rows.length } }, client);
  });
  res.json({ results, created: results.filter(item => item.status === 'created').length });
}));

customersRouter.get('/customers/:id/eligibility', route(async (req, res) => {
  await assertCustomerAccess(req, req.params.id);
  if (req.auth!.role === 'customer' && req.auth!.customerId !== req.params.id) throw forbidden();
  res.json(await individualEligibility(req.params.id));
}));
