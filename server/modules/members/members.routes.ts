import { Router } from 'express';
import { z } from 'zod';
import { many, one, transaction } from '../../db/pool';
import { audit } from '../../lib/audit';
import { badRequest, conflict, notFound, parse, route } from '../../lib/http';
import { newId } from '../../lib/ids';
import { requireCustomer, requirePermission } from '../../auth/permissions';
import { notifyStaffWithPermission, notifyUser } from '../notifications/notify';

export const membersRouter = Router();

function presentMember(row: any) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    nationalId: row.national_id,
    memberNumber: row.member_number,
    status: row.status,
    joinedOn: row.joined_on,
    statusReason: row.status_reason,
    verifiedBy: row.verifier_name,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    isDemo: row.data_source !== 'live',
  };
}

const MEMBER_SELECT = `
  SELECT m.*, c.name AS customer_name, c.national_id, v.name AS verifier_name
    FROM members m JOIN customers c ON c.id = m.customer_id LEFT JOIN users v ON v.id = m.verified_by`;

membersRouter.get('/members', requirePermission('members.view'), route(async (req, res) => {
  const input = parse(z.object({
    status: z.enum(['pending', 'active', 'suspended', 'terminated']).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(5).max(100).default(25),
  }), req.query);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (input.status) { params.push(input.status); conditions.push(`m.status = $${params.length}`); }
  if (input.search) {
    params.push(`%${input.search.toLowerCase()}%`);
    conditions.push(`(lower(c.name) LIKE $${params.length} OR lower(m.member_number) LIKE $${params.length} OR lower(c.national_id) LIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM members m JOIN customers c ON c.id = m.customer_id ${where}`, params);
  params.push(input.pageSize, (input.page - 1) * input.pageSize);
  const rows = await many(`${MEMBER_SELECT} ${where} ORDER BY m.status = 'pending' DESC, m.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  res.json({ items: rows.map(presentMember), total: total?.n ?? 0, page: input.page, pageSize: input.pageSize });
}));

const registerSchema = z.object({
  customerId: z.string().min(1).max(100),
  memberNumber: z.string().trim().min(2).max(50),
  joinedOn: z.iso.date(),
  status: z.enum(['pending', 'active']).default('active'),
});

/** Staff record a membership from the institution's membership register. */
membersRouter.post('/members', requirePermission('members.manage'), route(async (req, res) => {
  const input = parse(registerSchema, req.body);
  const customer = await one('SELECT id, name, user_id FROM customers WHERE id = $1', [input.customerId]);
  if (!customer) throw notFound('Customer not found.');
  const existing = await one('SELECT id FROM members WHERE customer_id = $1', [customer.id]);
  if (existing) throw conflict('This customer already has a membership record. Update it instead.', { memberId: existing.id });
  const numberTaken = await one('SELECT id FROM members WHERE upper(member_number) = upper($1)', [input.memberNumber]);
  if (numberTaken) throw conflict('This member number is already assigned to someone else.');

  const id = newId('mem');
  await transaction(async client => {
    await client.query(
      `INSERT INTO members (id, customer_id, member_number, status, joined_on, verified_by, verified_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $6)`,
      [id, customer.id, input.memberNumber, input.status, input.joinedOn,
        input.status === 'active' ? req.auth!.userId : null, input.status === 'active' ? new Date() : null],
    );
    await audit(req, { action: 'member.register', entityType: 'member', entityId: id, summary: `Registered ${customer.name} as member ${input.memberNumber} (${input.status}).` }, client);
    if (customer.user_id && input.status === 'active') {
      await notifyUser(customer.user_id, { type: 'success', title: 'Membership confirmed', body: `Your membership ${input.memberNumber} is active.`, actionRoute: '/client/profile' }, client);
    }
  });
  res.status(201).json(presentMember(await one(`${MEMBER_SELECT} WHERE m.id = $1`, [id])));
}));

const updateSchema = z.object({
  status: z.enum(['pending', 'active', 'suspended', 'terminated']).optional(),
  memberNumber: z.string().trim().min(2).max(50).optional(),
  joinedOn: z.iso.date().optional(),
  reason: z.string().trim().min(3).max(500),
}).strict();

membersRouter.patch('/members/:id', requirePermission('members.manage'), route(async (req, res) => {
  const input = parse(updateSchema, req.body);
  const member = await one(`${MEMBER_SELECT} WHERE m.id = $1`, [req.params.id]);
  if (!member) throw notFound('Member not found.');
  if (input.memberNumber && input.memberNumber.toUpperCase() !== member.member_number.toUpperCase()) {
    const clash = await one('SELECT id FROM members WHERE upper(member_number) = upper($1) AND id <> $2', [input.memberNumber, member.id]);
    if (clash) throw conflict('This member number is already assigned to someone else.');
  }
  const activating = input.status === 'active' && member.status !== 'active';
  await transaction(async client => {
    await client.query(
      `UPDATE members SET status = COALESCE($2, status), member_number = COALESCE($3, member_number), joined_on = COALESCE($4, joined_on),
              status_reason = $5,
              verified_by = CASE WHEN $6 THEN $7 ELSE verified_by END,
              verified_at = CASE WHEN $6 THEN now() ELSE verified_at END,
              updated_at = now()
        WHERE id = $1`,
      [member.id, input.status ?? null, input.memberNumber ?? null, input.joinedOn ?? null, input.reason, activating, req.auth!.userId],
    );
    await audit(req, {
      action: input.status && input.status !== member.status ? `member.${input.status === 'active' ? 'verify' : input.status}` : 'member.update',
      entityType: 'member', entityId: member.id,
      summary: `Membership ${member.member_number} for ${member.customer_name}: ${input.reason}`,
      metadata: { from: { status: member.status, memberNumber: member.member_number }, to: input },
    }, client);
  });
  res.json(presentMember(await one(`${MEMBER_SELECT} WHERE m.id = $1`, [member.id])));
}));

/**
 * A customer can tell us their member number. This only creates a PENDING record;
 * it does not make them eligible until staff check it against the membership register.
 */
membersRouter.post('/members/claim', requireCustomer, route(async (req, res) => {
  const { memberNumber } = parse(z.object({ memberNumber: z.string().trim().min(2).max(50) }), req.body);
  const customerId = req.auth!.customerId!;
  const existing = await one('SELECT id, status FROM members WHERE customer_id = $1', [customerId]);
  if (existing) throw conflict(`Your membership record already exists (${existing.status}).`);
  const taken = await one('SELECT id FROM members WHERE upper(member_number) = upper($1)', [memberNumber]);
  if (taken) throw badRequest('This member number is already linked to another person. Contact your branch.');
  const id = newId('mem');
  await transaction(async client => {
    await client.query(
      `INSERT INTO members (id, customer_id, member_number, status, created_by) VALUES ($1, $2, $3, 'pending', $4)`,
      [id, customerId, memberNumber, req.auth!.userId],
    );
    await audit(req, { action: 'member.claim', entityType: 'member', entityId: id, summary: `Customer submitted member number ${memberNumber} for verification.` }, client);
    await notifyStaffWithPermission('members.manage', {
      type: 'action', title: 'Membership to verify', body: `${req.auth!.fullName} submitted member number ${memberNumber}.`, actionRoute: '/staff/members',
      entityType: 'member', entityId: id,
    }, client);
  });
  res.status(201).json({ id, status: 'pending' });
}));
