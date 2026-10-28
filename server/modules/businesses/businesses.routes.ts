import { Router, type Request } from 'express';
import { z } from 'zod';
import { many, one, transaction } from '../../db/pool';
import { audit } from '../../lib/audit';
import { badRequest, conflict, forbidden, notFound, parse, route, unprocessable } from '../../lib/http';
import { newId } from '../../lib/ids';
import { assertBusinessAccess, customerPartyRoles, staffApplicationScope } from '../../auth/access';
import { assertPermission, hasPermission, requirePermission } from '../../auth/permissions';
import { businessEligibility } from '../members/eligibility';
import { notifyStaffWithPermission, notifyUser } from '../notifications/notify';

export const businessesRouter = Router();

const LEGAL_STRUCTURES = ['sole_proprietorship', 'partnership', 'private_limited', 'public_limited', 'cooperative', 'other'] as const;
const PARTY_ROLES = ['owner', 'director', 'beneficial_owner', 'representative', 'guarantor'] as const;
// Changing these on a verified business sends it back for verification.
const IDENTITY_FIELDS = ['registeredName', 'registrationNumber', 'tpin', 'legalStructure'];

function presentBusiness(row: any) {
  return {
    id: row.id,
    registeredName: row.registered_name,
    tradingName: row.trading_name,
    registrationNumber: row.registration_number,
    legalStructure: row.legal_structure,
    tpin: row.tpin,
    sector: row.sector,
    district: row.district,
    physicalAddress: row.physical_address,
    dateEstablished: row.date_established,
    employeeCount: row.employee_count,
    description: row.description,
    verificationStatus: row.verification_status,
    verificationNote: row.verification_note,
    verifiedAt: row.verified_at,
    verifiedBy: row.verifier_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDemo: row.data_source !== 'live',
    myRoles: row.my_roles ?? undefined,
  };
}

const businessSchema = z.object({
  registeredName: z.string().trim().min(2).max(255),
  tradingName: z.string().trim().max(255).optional().transform(value => value || null),
  registrationNumber: z.string().trim().max(100).optional().transform(value => value || null),
  legalStructure: z.enum(LEGAL_STRUCTURES),
  tpin: z.string().trim().max(50).optional().transform(value => value || null),
  sector: z.string().trim().min(2).max(100),
  district: z.string().trim().min(2).max(100),
  physicalAddress: z.string().trim().max(500).optional().transform(value => value || null),
  dateEstablished: z.iso.date().optional().nullable(),
  employeeCount: z.number().int().min(0).max(1_000_000).optional().nullable(),
  description: z.string().trim().max(2000).optional().transform(value => value || null),
});

async function assertNoDuplicate(registrationNumber: string | null, tpin: string | null, exceptId?: string) {
  if (registrationNumber) {
    const clash = await one('SELECT id FROM businesses WHERE upper(registration_number) = upper($1) AND id IS DISTINCT FROM $2', [registrationNumber, exceptId ?? null]);
    if (clash) throw conflict('A business with this registration number is already on file. Ask its owner or a branch officer to link you to it.');
  }
  if (tpin) {
    const clash = await one('SELECT id FROM businesses WHERE upper(tpin) = upper($1) AND id IS DISTINCT FROM $2', [tpin, exceptId ?? null]);
    if (clash) throw conflict('A business with this TPIN is already on file. Ask its owner or a branch officer to link you to it.');
  }
}

// ── List / detail ────────────────────────────────────────────────────────────

businessesRouter.get('/businesses', route(async (req, res) => {
  const auth = req.auth!;
  if (auth.role === 'customer') {
    const rows = await many(
      `SELECT b.*, array_agg(p.role) AS my_roles
         FROM businesses b JOIN business_parties p ON p.business_id = b.id AND p.customer_id = $1
        GROUP BY b.id ORDER BY b.registered_name`,
      [auth.customerId],
    );
    res.json({ items: rows.map(presentBusiness), total: rows.length, page: 1, pageSize: rows.length });
    return;
  }
  assertPermission(req, 'businesses.view');
  const input = parse(z.object({
    search: z.string().trim().max(100).optional(),
    sector: z.string().trim().max(100).optional(),
    verificationStatus: z.enum(['unverified', 'pending_verification', 'verified', 'rejected']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(5).max(100).default(25),
  }), req.query);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (input.search) {
    params.push(`%${input.search.toLowerCase()}%`);
    conditions.push(`(lower(b.registered_name) LIKE $${params.length} OR lower(b.trading_name) LIKE $${params.length} OR lower(b.registration_number) LIKE $${params.length} OR lower(b.tpin) LIKE $${params.length})`);
  }
  if (input.sector) { params.push(input.sector); conditions.push(`b.sector = $${params.length}`); }
  if (input.verificationStatus) { params.push(input.verificationStatus); conditions.push(`b.verification_status = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM businesses b ${where}`, params);
  params.push(input.pageSize, (input.page - 1) * input.pageSize);
  const rows = await many(
    `SELECT b.* FROM businesses b ${where}
      ORDER BY b.verification_status = 'pending_verification' DESC, b.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({ items: rows.map(presentBusiness), total: total?.n ?? 0, page: input.page, pageSize: input.pageSize });
}));

businessesRouter.get('/businesses/:id', route(async (req, res) => {
  await assertBusinessAccess(req, req.params.id, 'view');
  const business = await one('SELECT b.*, v.name AS verifier_name FROM businesses b LEFT JOIN users v ON v.id = b.verified_by WHERE b.id = $1', [req.params.id]);
  const parties = await many(
    `SELECT p.*, c.name, c.national_id, c.phone, m.member_number, m.status AS member_status, m.verified_at AS member_verified_at,
            d.status AS authorization_status
       FROM business_parties p JOIN customers c ON c.id = p.customer_id
       LEFT JOIN members m ON m.customer_id = p.customer_id
       LEFT JOIN documents d ON d.id = p.authorization_document_id AND d.deleted_at IS NULL
      WHERE p.business_id = $1 ORDER BY p.role, c.name`,
    [business.id],
  );
  const financials = await many(
    `SELECT f.*, u.name AS recorded_by_name FROM business_financials f LEFT JOIN users u ON u.id = f.recorded_by
      WHERE f.business_id = $1 ORDER BY f.period_end DESC, f.created_at DESC`,
    [business.id],
  );

  let applicationRows: any[];
  if (req.auth!.isStaff) {
    const scope = await staffApplicationScope(req, 'a', 2);
    applicationRows = await many(
      `SELECT a.id, a.reference, a.status, a.amount, a.term_months, a.submitted_at, p.name AS product_name
         FROM loan_applications a LEFT JOIN loan_products p ON p.id = a.product_id
        WHERE a.business_id = $1 AND ${scope.sql} ORDER BY a.created_at DESC`,
      [business.id, ...scope.params],
    );
  } else {
    applicationRows = await many(
      `SELECT a.id, a.reference, a.status, a.amount, a.term_months, a.submitted_at, p.name AS product_name
         FROM loan_applications a LEFT JOIN loan_products p ON p.id = a.product_id
        WHERE a.business_id = $1 ORDER BY a.created_at DESC`,
      [business.id],
    );
  }

  const isStaff = req.auth!.isStaff;
  res.json({
    ...presentBusiness(business),
    myRoles: req.auth!.customerId ? await customerPartyRoles(req.auth!.customerId, business.id) : undefined,
    parties: parties.map(party => ({
      id: party.id,
      customerId: party.customer_id,
      name: party.name,
      // Other customers' identity numbers are only shown to staff.
      nationalId: isStaff || party.customer_id === req.auth!.customerId ? party.national_id : null,
      phone: isStaff ? party.phone : null,
      role: party.role,
      ownershipPct: party.ownership_pct,
      isSignatory: party.is_signatory,
      verified: party.verified,
      verifiedAt: party.verified_at,
      authorizationDocumentId: party.authorization_document_id,
      authorizationStatus: party.authorization_status,
      membership: party.member_number ? { memberNumber: party.member_number, status: party.member_status, verified: Boolean(party.member_verified_at) } : null,
    })),
    financials: financials.map(item => ({
      id: item.id,
      periodStart: item.period_start,
      periodEnd: item.period_end,
      avgMonthlyRevenue: item.avg_monthly_revenue,
      avgMonthlyCostOfSales: item.avg_monthly_cost_of_sales,
      avgMonthlyOperatingExpenses: item.avg_monthly_operating_expenses,
      existingMonthlyDebtService: item.existing_monthly_debt_service,
      largestCustomerShare: item.largest_customer_share,
      source: item.source,
      supportingDocumentId: item.supporting_document_id,
      notes: item.notes,
      recordedBy: item.recorded_by_name,
      createdAt: item.created_at,
    })),
    applications: applicationRows.map(item => ({
      id: item.id, reference: item.reference, status: item.status, amount: item.amount,
      termMonths: item.term_months, productName: item.product_name, submittedAt: item.submitted_at,
    })),
  });
}));

// ── Create / update ──────────────────────────────────────────────────────────

const createSchema = businessSchema.extend({
  // Customers say how they relate to the business; staff link people separately.
  myRole: z.enum(['owner', 'director', 'representative']).optional(),
  ownershipPct: z.number().min(0).max(100).optional(),
});

businessesRouter.post('/businesses', route(async (req, res) => {
  const auth = req.auth!;
  const input = parse(createSchema, req.body);
  if (auth.isStaff) assertPermission(req, 'businesses.manage');
  else if (!auth.customerId) throw forbidden();
  if (!auth.isStaff && !input.myRole) throw badRequest('Tell us your role in the business.', [{ field: 'myRole', message: 'Required.' }]);
  await assertNoDuplicate(input.registrationNumber, input.tpin);

  const id = newId('biz');
  await transaction(async client => {
    await client.query(
      `INSERT INTO businesses (id, registered_name, trading_name, registration_number, legal_structure, tpin, sector, district,
                               physical_address, date_established, employee_count, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, input.registeredName, input.tradingName, input.registrationNumber, input.legalStructure, input.tpin, input.sector,
        input.district, input.physicalAddress, input.dateEstablished ?? null, input.employeeCount ?? null, input.description, auth.userId],
    );
    if (!auth.isStaff) {
      await client.query(
        `INSERT INTO business_parties (id, business_id, customer_id, role, ownership_pct, is_signatory, added_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newId('bpt'), id, auth.customerId, input.myRole, input.ownershipPct ?? null, input.myRole !== 'representative', auth.userId],
      );
      await client.query(`UPDATE customers SET segment = 'sme', updated_at = now() WHERE id = $1`, [auth.customerId]);
    }
    await audit(req, { action: 'business.create', entityType: 'business', entityId: id, summary: `Created business profile ${input.registeredName}.`, metadata: { myRole: input.myRole } }, client);
  });
  res.status(201).json(presentBusiness(await one('SELECT * FROM businesses WHERE id = $1', [id])));
}));

businessesRouter.patch('/businesses/:id', route(async (req, res) => {
  await assertBusinessAccess(req, req.params.id, 'manage');
  const input = parse(businessSchema.partial().strict(), req.body);
  const existing = await one('SELECT * FROM businesses WHERE id = $1', [req.params.id]);
  await assertNoDuplicate(input.registrationNumber ?? null, input.tpin ?? null, existing.id);
  const map: Record<string, string> = {
    registeredName: 'registered_name', tradingName: 'trading_name', registrationNumber: 'registration_number', legalStructure: 'legal_structure',
    tpin: 'tpin', sector: 'sector', district: 'district', physicalAddress: 'physical_address', dateEstablished: 'date_established',
    employeeCount: 'employee_count', description: 'description',
  };
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (!entries.length) throw badRequest('Nothing to update.');
  const identityChanged = entries.some(([key, value]) => IDENTITY_FIELDS.includes(key) && String(existing[map[key]] ?? '') !== String(value ?? ''));
  const resetVerification = identityChanged && existing.verification_status === 'verified';

  await transaction(async client => {
    await client.query(
      `UPDATE businesses SET ${entries.map(([key], index) => `${map[key]} = $${index + 2}`).join(', ')},
              verification_status = CASE WHEN $${entries.length + 2} THEN 'pending_verification' ELSE verification_status END,
              updated_at = now()
        WHERE id = $1`,
      [existing.id, ...entries.map(([, value]) => value), resetVerification],
    );
    await audit(req, {
      action: 'business.update', entityType: 'business', entityId: existing.id,
      summary: `Updated business ${existing.registered_name}${resetVerification ? ' (identity details changed; re-verification required)' : ''}.`,
      metadata: { fields: entries.map(([key]) => key) },
    }, client);
  });
  res.json(presentBusiness(await one('SELECT * FROM businesses WHERE id = $1', [existing.id])));
}));

businessesRouter.post('/businesses/:id/submit-for-verification', route(async (req, res) => {
  await assertBusinessAccess(req, req.params.id, 'manage');
  const business = await one('SELECT id, registered_name, verification_status FROM businesses WHERE id = $1', [req.params.id]);
  if (business.verification_status === 'verified') throw badRequest('This business is already verified.');
  const registration = await one(`SELECT 1 FROM documents WHERE business_id = $1 AND document_type = 'business_registration' AND status IN ('pending_review', 'verified') AND deleted_at IS NULL`, [business.id]);
  if (!registration) throw unprocessable('Upload the business registration certificate before asking for verification.');
  await transaction(async client => {
    await client.query(`UPDATE businesses SET verification_status = 'pending_verification', updated_at = now() WHERE id = $1`, [business.id]);
    await audit(req, { action: 'business.submit_verification', entityType: 'business', entityId: business.id, summary: `Requested verification of ${business.registered_name}.` }, client);
    await notifyStaffWithPermission('businesses.verify', {
      type: 'action', title: 'Business to verify', body: `${business.registered_name} is waiting for verification.`,
      actionRoute: `/staff/businesses/${business.id}`, entityType: 'business', entityId: business.id,
    }, client);
  });
  res.json({ verificationStatus: 'pending_verification' });
}));

businessesRouter.post('/businesses/:id/verify', requirePermission('businesses.verify'), route(async (req, res) => {
  const input = parse(z.object({ decision: z.enum(['verified', 'rejected']), note: z.string().trim().max(1000).optional() }), req.body);
  const business = await one('SELECT id, registered_name, created_by FROM businesses WHERE id = $1', [req.params.id]);
  if (!business) throw notFound('Business not found.');
  if (input.decision === 'rejected' && !input.note) throw badRequest('Give a reason for rejecting.', [{ field: 'note', message: 'Required when rejecting.' }]);
  if (input.decision === 'verified') {
    const problems: string[] = [];
    const registration = await one(`SELECT 1 FROM documents WHERE business_id = $1 AND document_type = 'business_registration' AND status = 'verified' AND deleted_at IS NULL`, [business.id]);
    if (!registration) problems.push('The business registration certificate has not been verified.');
    const principal = await one(`SELECT 1 FROM business_parties WHERE business_id = $1 AND role IN ('owner', 'director') AND verified`, [business.id]);
    if (!principal) problems.push('At least one owner or director must be verified first.');
    if (problems.length) throw unprocessable('This business cannot be verified yet.', problems.map(message => ({ field: 'decision', message })));
  }
  await transaction(async client => {
    await client.query(
      `UPDATE businesses SET verification_status = $2, verification_note = $3, verified_by = $4, verified_at = now(), updated_at = now() WHERE id = $1`,
      [business.id, input.decision, input.note ?? null, req.auth!.userId],
    );
    await audit(req, { action: `business.${input.decision === 'verified' ? 'verify' : 'reject'}`, entityType: 'business', entityId: business.id, summary: `${input.decision === 'verified' ? 'Verified' : 'Rejected'} business ${business.registered_name}.`, metadata: { note: input.note } }, client);
    const owners = await many<{ user_id: string }>(
      `SELECT c.user_id FROM business_parties p JOIN customers c ON c.id = p.customer_id WHERE p.business_id = $1 AND c.user_id IS NOT NULL`,
      [business.id], client,
    );
    for (const owner of owners) {
      await notifyUser(owner.user_id, {
        type: input.decision === 'verified' ? 'success' : 'warning',
        title: input.decision === 'verified' ? 'Business verified' : 'Business verification unsuccessful',
        body: input.decision === 'verified' ? `${business.registered_name} has been verified.` : `${business.registered_name}: ${input.note}`,
        actionRoute: `/client/business/${business.id}`, entityType: 'business', entityId: business.id,
      }, client);
    }
  });
  res.json({ verificationStatus: input.decision });
}));

// ── Linked people ────────────────────────────────────────────────────────────

const partySchema = z.object({
  customerId: z.string().max(100).optional(),
  // Customers identify a person by national ID; a profile is created if none exists yet.
  nationalId: z.string().trim().min(5).max(100).optional(),
  fullName: z.string().trim().min(3).max(255).optional(),
  phone: z.string().trim().min(7).max(50).optional(),
  role: z.enum(PARTY_ROLES),
  ownershipPct: z.number().min(0).max(100).optional().nullable(),
  isSignatory: z.boolean().default(false),
});

async function resolvePartyCustomer(req: Request, input: z.infer<typeof partySchema>, client: any): Promise<string> {
  if (input.customerId) {
    if (!req.auth!.isStaff) throw forbidden('Identify the person by national ID.');
    const found = await one('SELECT id FROM customers WHERE id = $1', [input.customerId], client);
    if (!found) throw notFound('Customer not found.');
    return found.id;
  }
  if (!input.nationalId || !input.fullName) throw badRequest('Give the person’s full name and national ID.');
  const existing = await one('SELECT id FROM customers WHERE upper(national_id) = upper($1)', [input.nationalId], client);
  if (existing) return existing.id;
  const id = newId('cus');
  await client.query(
    `INSERT INTO customers (id, name, national_id, phone, segment, status, is_activated, created_by) VALUES ($1, $2, $3, $4, 'sme', 'Active', FALSE, $5)`,
    [id, input.fullName, input.nationalId, input.phone ?? null, req.auth!.userId],
  );
  return id;
}

businessesRouter.post('/businesses/:id/parties', route(async (req, res) => {
  await assertBusinessAccess(req, req.params.id, 'manage');
  const input = parse(partySchema, req.body);
  const partyId = newId('bpt');
  await transaction(async client => {
    const customerId = await resolvePartyCustomer(req, input, client);
    const duplicate = await one('SELECT 1 FROM business_parties WHERE business_id = $1 AND customer_id = $2 AND role = $3', [req.params.id, customerId, input.role], client);
    if (duplicate) throw conflict('This person is already linked to the business in that role.');
    if (input.ownershipPct) {
      const owned = await one<{ total: number }>(`SELECT COALESCE(sum(ownership_pct), 0)::float AS total FROM business_parties WHERE business_id = $1 AND role IN ('owner', 'beneficial_owner')`, [req.params.id], client);
      if (['owner', 'beneficial_owner'].includes(input.role) && (owned?.total ?? 0) + input.ownershipPct > 100.0001) {
        throw badRequest('Ownership would exceed 100%.');
      }
    }
    await client.query(
      `INSERT INTO business_parties (id, business_id, customer_id, role, ownership_pct, is_signatory, added_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [partyId, req.params.id, customerId, input.role, input.ownershipPct ?? null, input.isSignatory, req.auth!.userId],
    );
    await audit(req, { action: 'business.party_add', entityType: 'business', entityId: req.params.id, summary: `Linked a ${input.role} to the business.`, metadata: { partyId, customerId, role: input.role } }, client);
  });
  res.status(201).json({ id: partyId });
}));

businessesRouter.delete('/businesses/:id/parties/:partyId', route(async (req, res) => {
  await assertBusinessAccess(req, req.params.id, 'manage');
  const party = await one('SELECT * FROM business_parties WHERE id = $1 AND business_id = $2', [req.params.partyId, req.params.id]);
  if (!party) throw notFound('Linked person not found.');
  if (party.customer_id === req.auth!.customerId && ['owner', 'director'].includes(party.role)) {
    throw forbidden('You cannot remove your own ownership. Ask a branch officer.');
  }
  if (['owner', 'director'].includes(party.role)) {
    const remaining = await one<{ n: number }>(`SELECT count(*)::int AS n FROM business_parties WHERE business_id = $1 AND role IN ('owner', 'director') AND id <> $2`, [req.params.id, party.id]);
    if (!remaining?.n) throw conflict('A business must keep at least one owner or director.');
  }
  await transaction(async client => {
    await client.query('DELETE FROM business_parties WHERE id = $1', [party.id]);
    await audit(req, { action: 'business.party_remove', entityType: 'business', entityId: req.params.id, summary: `Removed a linked ${party.role}.`, metadata: { partyId: party.id, customerId: party.customer_id } }, client);
  });
  res.status(204).end();
}));

businessesRouter.post('/businesses/:id/parties/:partyId/verify', requirePermission('businesses.verify'), route(async (req, res) => {
  const input = parse(z.object({ verified: z.boolean(), authorizationDocumentId: z.string().max(100).optional().nullable(), note: z.string().trim().max(500).optional() }), req.body);
  const party = await one('SELECT * FROM business_parties WHERE id = $1 AND business_id = $2', [req.params.partyId, req.params.id]);
  if (!party) throw notFound('Linked person not found.');
  if (input.authorizationDocumentId) {
    const doc = await one(`SELECT 1 FROM documents WHERE id = $1 AND business_id = $2 AND document_type = 'authorization_letter' AND deleted_at IS NULL`, [input.authorizationDocumentId, req.params.id]);
    if (!doc) throw badRequest('The authorisation document must be an authorisation letter uploaded to this business.');
  }
  await transaction(async client => {
    await client.query(
      `UPDATE business_parties SET verified = $2, verified_by = $3, verified_at = CASE WHEN $2 THEN now() ELSE NULL END,
              authorization_document_id = COALESCE($4, authorization_document_id)
        WHERE id = $1`,
      [party.id, input.verified, req.auth!.userId, input.authorizationDocumentId ?? null],
    );
    await audit(req, { action: input.verified ? 'business.party_verify' : 'business.party_unverify', entityType: 'business', entityId: req.params.id, summary: `${input.verified ? 'Verified' : 'Removed verification of'} a linked ${party.role}.`, metadata: { partyId: party.id, note: input.note } }, client);
  });
  res.json({ id: party.id, verified: input.verified });
}));

// ── Financial information ────────────────────────────────────────────────────

const financialsSchema = z.object({
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  avgMonthlyRevenue: z.number().nonnegative().max(1e13),
  avgMonthlyCostOfSales: z.number().nonnegative().max(1e13).default(0),
  avgMonthlyOperatingExpenses: z.number().nonnegative().max(1e13).default(0),
  existingMonthlyDebtService: z.number().nonnegative().max(1e13).default(0),
  largestCustomerShare: z.number().min(0).max(1).optional().nullable(),
  supportingDocumentId: z.string().max(100).optional().nullable(),
  notes: z.string().trim().max(1000).optional(),
}).refine(value => value.periodStart <= value.periodEnd, { message: 'The period must start before it ends.', path: ['periodEnd'] });

/**
 * Customers declare figures (source "applicant"). Staff with businesses.verify record figures
 * they have checked against documents (source "verified"). Both are kept; neither overwrites the other.
 */
businessesRouter.post('/businesses/:id/financials', route(async (req, res) => {
  const auth = req.auth!;
  const input = parse(financialsSchema, req.body);
  let source: 'applicant' | 'verified' = 'applicant';
  if (auth.isStaff) {
    await assertBusinessAccess(req, req.params.id, 'view');
    assertPermission(req, 'businesses.verify');
    if (!input.supportingDocumentId) throw badRequest('Verified figures must reference the supporting document (e.g. bank statement).');
    source = 'verified';
  } else {
    await assertBusinessAccess(req, req.params.id, 'manage');
  }
  if (input.supportingDocumentId) {
    const doc = await one(
      `SELECT status FROM documents WHERE id = $1 AND deleted_at IS NULL
         AND (business_id = $2 OR application_id IN (SELECT id FROM loan_applications WHERE business_id = $2))`,
      [input.supportingDocumentId, req.params.id],
    );
    if (!doc) throw badRequest('The supporting document must belong to this business or one of its applications.');
    if (source === 'verified' && doc.status !== 'verified') throw unprocessable('Verify the supporting document before recording verified figures from it.');
  }
  const id = newId('fin');
  await transaction(async client => {
    await client.query(
      `INSERT INTO business_financials (id, business_id, period_start, period_end, avg_monthly_revenue, avg_monthly_cost_of_sales,
                                        avg_monthly_operating_expenses, existing_monthly_debt_service, largest_customer_share, source,
                                        supporting_document_id, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, req.params.id, input.periodStart, input.periodEnd, input.avgMonthlyRevenue, input.avgMonthlyCostOfSales, input.avgMonthlyOperatingExpenses,
        input.existingMonthlyDebtService, input.largestCustomerShare ?? null, source, input.supportingDocumentId ?? null, input.notes ?? null, auth.userId],
    );
    await audit(req, { action: 'business.financials_record', entityType: 'business', entityId: req.params.id, summary: `Recorded ${source} financial figures.`, metadata: { financialsId: id, source } }, client);
  });
  res.status(201).json({ id, source });
}));

businessesRouter.get('/businesses/:id/eligibility', route(async (req, res) => {
  await assertBusinessAccess(req, req.params.id, 'view');
  const { applicantCustomerId } = parse(z.object({ applicantCustomerId: z.string().max(100).optional() }), req.query);
  const applicant = req.auth!.role === 'customer' ? req.auth!.customerId! : applicantCustomerId;
  if (!applicant) throw badRequest('applicantCustomerId is required.');
  if (req.auth!.isStaff && !hasPermission(req, 'businesses.view')) throw forbidden();
  res.json(await businessEligibility(req.params.id, applicant));
}));
