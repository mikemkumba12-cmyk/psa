import crypto from 'crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { many, one, transaction } from '../../db/pool';
import { audit } from '../../lib/audit';
import { badRequest, conflict, forbidden, notFound, parse, route } from '../../lib/http';
import { newId } from '../../lib/ids';
import { hashSecret } from '../../auth/passwords';
import { revokeAllSessions } from '../../auth/sessions';
import { assertPermission, loadEffectivePermissions, PERMISSIONS, requirePermission, STAFF_ROLES, type Permission } from '../../auth/permissions';

export const staffRouter = Router();

/** Readable one-time password that satisfies the password policy. */
function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(14);
  const body = [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
  return `${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10)}7`;
}

function presentStaff(row: any) {
  return {
    id: row.id,
    fullName: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    staffTitle: row.staff_title,
    isActive: row.is_active,
    approvalLimit: row.approval_limit,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    mustChangePassword: row.must_change_password,
    productIds: row.product_ids || [],
    grants: row.grants || [],
    denies: row.denies || [],
  };
}

const STAFF_SELECT = `
  SELECT u.id, u.name, u.email, u.phone, u.role, u.staff_title, u.is_active, u.approval_limit, u.last_login_at,
         u.created_at, u.must_change_password,
         COALESCE((SELECT array_agg(product_id ORDER BY product_id) FROM user_product_access WHERE user_id = u.id), '{}') AS product_ids,
         COALESCE((SELECT array_agg(permission_id ORDER BY permission_id) FROM user_permissions WHERE user_id = u.id AND effect = 'grant'), '{}') AS grants,
         COALESCE((SELECT array_agg(permission_id ORDER BY permission_id) FROM user_permissions WHERE user_id = u.id AND effect = 'deny'), '{}') AS denies
    FROM users u`;

function assertCanManageStaff(req: Request) {
  if (!req.auth!.permissions.has('staff.manage') && !req.auth!.permissions.has('permissions.manage')) {
    assertPermission(req, 'staff.manage');
  }
}

async function activeAdminCount(excludingUserId?: string): Promise<number> {
  const row = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND is_active AND ($1::text IS NULL OR id <> $1)`,
    [excludingUserId ?? null],
  );
  return row?.n ?? 0;
}

// ── Catalogue ────────────────────────────────────────────────────────────────

staffRouter.get('/admin/permissions', route(async (req, res) => {
  assertCanManageStaff(req);
  const permissions = await many('SELECT id, name, resource, description FROM permissions ORDER BY sort_order, id');
  const defaults = await many('SELECT role_id, permission_id FROM role_permissions');
  const roleDefaults: Record<string, string[]> = { admin: [...PERMISSIONS] };
  for (const row of defaults) (roleDefaults[row.role_id] ||= []).push(row.permission_id);
  res.json({
    permissions: permissions.map(row => ({ id: row.id, name: row.name, group: row.resource, description: row.description })),
    roles: STAFF_ROLES,
    roleDefaults,
  });
}));

// ── Staff directory ──────────────────────────────────────────────────────────

staffRouter.get('/admin/staff', route(async (req, res) => {
  assertCanManageStaff(req);
  const rows = await many(`${STAFF_SELECT} WHERE u.role <> 'customer' ORDER BY u.is_active DESC, u.name`);
  res.json(rows.map(presentStaff));
}));

/** Lightweight list for pickers (e.g. assigning an application). Any staff member may read names and roles. */
staffRouter.get('/staff/directory', route(async (req, res) => {
  if (!req.auth!.isStaff) throw forbidden();
  const rows = await many(`SELECT id, name, role, staff_title FROM users WHERE role <> 'customer' AND is_active ORDER BY name`);
  res.json(rows.map(row => ({ id: row.id, fullName: row.name, role: row.role, staffTitle: row.staff_title })));
}));

const createSchema = z.object({
  fullName: z.string().trim().min(3).max(255),
  email: z.email().transform(value => value.toLowerCase()),
  phone: z.string().trim().max(50).optional(),
  role: z.enum(STAFF_ROLES),
  staffTitle: z.string().trim().max(120).optional(),
});

staffRouter.post('/admin/staff', requirePermission('staff.manage'), route(async (req, res) => {
  const input = parse(createSchema, req.body);
  if (input.role === 'admin' && req.auth!.role !== 'admin') throw forbidden('Only administrators can create administrator accounts.');
  const existing = await one('SELECT 1 FROM users WHERE lower(email) = $1', [input.email]);
  if (existing) throw conflict('An account with this email already exists.');

  const id = newId('usr');
  const password = temporaryPassword();
  await transaction(async client => {
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, phone, staff_title, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
      [id, input.email, await hashSecret(password), input.fullName, input.role, input.phone ?? null, input.staffTitle ?? null],
    );
    await audit(req, {
      action: 'staff.create', entityType: 'user', entityId: id,
      summary: `Created ${input.role} account for ${input.fullName}.`, metadata: { role: input.role, email: input.email },
    }, client);
  });
  const created = await one(`${STAFF_SELECT} WHERE u.id = $1`, [id]);
  // The temporary password is shown once to the administrator and must be changed at first sign-in.
  res.status(201).json({ staff: presentStaff(created), temporaryPassword: password });
}));

const updateSchema = z.object({
  fullName: z.string().trim().min(3).max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  staffTitle: z.string().trim().max(120).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  isActive: z.boolean().optional(),
}).strict();

staffRouter.patch('/admin/staff/:id', requirePermission('staff.manage'), route(async (req, res) => {
  const input = parse(updateSchema, req.body);
  const target = await one(`SELECT id, name, role, is_active FROM users WHERE id = $1 AND role <> 'customer'`, [req.params.id]);
  if (!target) throw notFound('Staff member not found.');
  const self = target.id === req.auth!.userId;

  if (input.role && input.role !== target.role) {
    assertPermission(req, 'permissions.manage');
    if (self) throw forbidden('You cannot change your own role.');
    if ((input.role === 'admin' || target.role === 'admin') && req.auth!.role !== 'admin') {
      throw forbidden('Only administrators can grant or remove the administrator role.');
    }
  }
  if (input.isActive === false && self) throw forbidden('You cannot deactivate your own account.');
  if (target.role === 'admin' && req.auth!.role !== 'admin') throw forbidden('Only administrators can change administrator accounts.');
  const losingAdmin = target.role === 'admin' && ((input.role && input.role !== 'admin') || input.isActive === false);
  if (losingAdmin && await activeAdminCount(target.id) === 0) {
    throw conflict('This is the last active administrator. Create another administrator first.');
  }

  await transaction(async client => {
    await client.query(
      `UPDATE users SET name = COALESCE($2, name), phone = COALESCE($3, phone), staff_title = COALESCE($4, staff_title),
              role = COALESCE($5, role), is_active = COALESCE($6, is_active), updated_at = now()
        WHERE id = $1`,
      [target.id, input.fullName ?? null, input.phone ?? null, input.staffTitle ?? null, input.role ?? null, input.isActive ?? null],
    );
    if (input.isActive === false) await revokeAllSessions(target.id, 'deactivated', undefined, client);
    await audit(req, {
      action: input.isActive === false ? 'staff.deactivate' : input.isActive === true && !target.is_active ? 'staff.reactivate' : 'staff.update',
      entityType: 'user', entityId: target.id,
      summary: `Updated staff account ${target.name}.`,
      metadata: { changes: input, previousRole: target.role },
    }, client);
  });
  res.json(presentStaff(await one(`${STAFF_SELECT} WHERE u.id = $1`, [target.id])));
}));

staffRouter.post('/admin/staff/:id/reset-password', requirePermission('staff.manage'), route(async (req, res) => {
  const target = await one(`SELECT id, name, role FROM users WHERE id = $1 AND role <> 'customer'`, [req.params.id]);
  if (!target) throw notFound('Staff member not found.');
  if (target.id === req.auth!.userId) throw badRequest('Use "Change password" for your own account.');
  if (target.role === 'admin' && req.auth!.role !== 'admin') throw forbidden('Only administrators can reset administrator passwords.');
  const password = temporaryPassword();
  await transaction(async client => {
    await client.query(
      `UPDATE users SET password_hash = $2, must_change_password = TRUE, token_version = token_version + 1,
              failed_login_count = 0, locked_until = NULL, updated_at = now()
        WHERE id = $1`,
      [target.id, await hashSecret(password)],
    );
    await revokeAllSessions(target.id, 'password_reset_by_admin', undefined, client);
    await audit(req, { action: 'staff.password_reset', entityType: 'user', entityId: target.id, summary: `Issued a temporary password to ${target.name}.` }, client);
  });
  res.json({ temporaryPassword: password });
}));

// ── Access: permissions, products, approval limit ────────────────────────────

staffRouter.get('/admin/staff/:id/access', requirePermission('permissions.manage'), route(async (req, res) => {
  const target = await one(`${STAFF_SELECT} WHERE u.id = $1 AND u.role <> 'customer'`, [req.params.id]);
  if (!target) throw notFound('Staff member not found.');
  const effective = await loadEffectivePermissions(target.id, target.role);
  res.json({ ...presentStaff(target), effectivePermissions: [...effective].sort() });
}));

const accessSchema = z.object({
  grants: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  denies: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  productIds: z.array(z.string().max(100)).max(200),
  approvalLimit: z.number().nonnegative().max(1e13).nullable(),
});

staffRouter.put('/admin/staff/:id/access', requirePermission('permissions.manage'), route(async (req, res) => {
  const input = parse(accessSchema, req.body);
  const target = await one(`${STAFF_SELECT} WHERE u.id = $1 AND u.role <> 'customer'`, [req.params.id]);
  if (!target) throw notFound('Staff member not found.');
  if (target.id === req.auth!.userId) throw forbidden('You cannot change your own access. Ask another administrator.');
  if (target.role === 'admin' && req.auth!.role !== 'admin') throw forbidden('Only administrators can change administrator access.');
  const overlap = input.grants.filter(permission => input.denies.includes(permission));
  if (overlap.length) throw badRequest(`A permission cannot be both granted and denied: ${overlap.join(', ')}.`);
  // Nobody may hand out a permission they do not hold themselves.
  const escalation = input.grants.filter(permission => !req.auth!.permissions.has(permission as Permission));
  if (escalation.length) throw forbidden(`You cannot grant permissions you do not hold: ${escalation.join(', ')}.`);

  if (input.productIds.length) {
    const found = await many<{ id: string }>('SELECT id FROM loan_products WHERE id = ANY($1::text[])', [input.productIds]);
    if (found.length !== new Set(input.productIds).size) throw badRequest('One or more loan products do not exist.');
  }

  await transaction(async client => {
    await client.query('DELETE FROM user_permissions WHERE user_id = $1', [target.id]);
    for (const permission of input.grants) {
      await client.query(`INSERT INTO user_permissions (user_id, permission_id, effect, granted_by) VALUES ($1, $2, 'grant', $3)`, [target.id, permission, req.auth!.userId]);
    }
    for (const permission of input.denies) {
      await client.query(`INSERT INTO user_permissions (user_id, permission_id, effect, granted_by) VALUES ($1, $2, 'deny', $3)`, [target.id, permission, req.auth!.userId]);
    }
    await client.query('DELETE FROM user_product_access WHERE user_id = $1', [target.id]);
    for (const productId of new Set(input.productIds)) {
      await client.query('INSERT INTO user_product_access (user_id, product_id, granted_by) VALUES ($1, $2, $3)', [target.id, productId, req.auth!.userId]);
    }
    await client.query('UPDATE users SET approval_limit = $2, updated_at = now() WHERE id = $1', [target.id, input.approvalLimit]);

    const diff = (before: string[], after: string[]) => ({
      added: after.filter(item => !before.includes(item)),
      removed: before.filter(item => !after.includes(item)),
    });
    await audit(req, {
      action: 'permissions.update', entityType: 'user', entityId: target.id,
      summary: `Updated access for ${target.name}.`,
      metadata: {
        grants: diff(target.grants, input.grants),
        denies: diff(target.denies, input.denies),
        products: diff(target.product_ids, input.productIds),
        approvalLimit: { from: target.approval_limit, to: input.approvalLimit },
      },
    }, client);
  });

  const updated = await one(`${STAFF_SELECT} WHERE u.id = $1`, [target.id]);
  const effective = await loadEffectivePermissions(target.id, target.role);
  res.json({ ...presentStaff(updated), effectivePermissions: [...effective].sort() });
}));
