import { Router } from 'express';
import { z } from 'zod';
import { many, one, transaction } from '../../db/pool';
import { loadEffectivePermissions, requirePermission, type Permission } from '../../auth/permissions';
import { audit } from '../../lib/audit';
import { conflict, forbidden, notFound, parse, route } from '../../lib/http';
import { settingSchemas } from '../settings/settings';
import { PRODUCT_COLUMN_FOR, productCreateSchema, productUpdateSchema } from '../products/products.routes';
import { activationBlockers, type ProductRow } from '../products/products.service';

export const governanceRouter = Router();

function safeChangePayload(type: string, payload: any) {
  if (type !== 'staff_create') return payload;
  const safe = { ...payload };
  delete safe.passwordHash;
  return safe;
}

governanceRouter.get('/governance/changes', route(async (req, res) => {
  const canAccess = req.auth!.permissions.has('permissions.manage');
  const canSettings = req.auth!.permissions.has('settings.manage');
  const canProducts = req.auth!.permissions.has('products.manage');
  const canStaff = req.auth!.permissions.has('staff.manage');
  if (!canAccess && !canSettings && !canProducts && !canStaff) throw forbidden();
  const rows = await many(`
    SELECT r.id, r.change_type, r.entity_id, r.payload, r.previous_value, r.status,
           r.requested_by, requester.name AS requester_name, r.reviewed_by, reviewer.name AS reviewer_name,
           r.reviewed_at, r.review_note, r.created_at,
           COALESCE((SELECT json_agg(json_build_object('eventType', e.event_type, 'actorId', e.actor_id, 'actorName', u.name, 'note', e.note, 'createdAt', e.created_at) ORDER BY e.created_at)
             FROM governance_change_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.request_id = r.id), '[]'::json) AS events
      FROM governance_change_requests r
      JOIN users requester ON requester.id = r.requested_by
      LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
     ORDER BY (r.status = 'pending') DESC, r.created_at DESC
     LIMIT 200`);
  res.json(rows.filter(row => row.change_type === 'access' ? canAccess : row.change_type === 'setting' ? canSettings : row.change_type === 'product' ? canProducts : canStaff).map(row => ({
    id: row.id, type: row.change_type, entityId: row.entity_id,
    payload: safeChangePayload(row.change_type, row.payload),
    previousValue: row.previous_value, status: row.status, requestedBy: row.requester_name,
    requestedById: row.requested_by, reviewedBy: row.reviewer_name, reviewedById: row.reviewed_by,
    reviewedAt: row.reviewed_at, reviewNote: row.review_note, createdAt: row.created_at, events: row.events,
  })));
}));

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().min(5, 'Explain the decision (at least 5 characters).').max(1000),
});

governanceRouter.post('/governance/changes/:id/decision', route(async (req, res) => {
  const input = parse(decisionSchema, req.body);
  const result = await transaction(async client => {
    const change = await one<any>(`SELECT * FROM governance_change_requests WHERE id = $1 FOR UPDATE`, [req.params.id], client);
    if (!change) throw notFound('Governance request not found.');
    if (change.status !== 'pending') throw conflict('This request has already been reviewed.');
    if (change.requested_by === req.auth!.userId) throw forbidden('The person who submitted a change cannot review it.');
    const requester = await one<{ role: string; is_active: boolean }>('SELECT role, is_active FROM users WHERE id = $1', [change.requested_by], client);
    let requesterPermissions = new Set<Permission>();
    const requiredPermission = change.change_type === 'access' ? 'permissions.manage' : change.change_type === 'setting' ? 'settings.manage' : change.change_type === 'product' ? 'products.manage' : 'staff.manage';
    if (input.decision === 'approve') {
      if (!requester?.is_active) throw conflict('The requester’s account is no longer active. This request cannot be approved.');
      requesterPermissions = await loadEffectivePermissions(change.requested_by, requester.role, client);
      if (!requesterPermissions.has(requiredPermission)) throw conflict('The requester no longer has permission to make this change. Submit a new request.');
    }

    if (change.change_type === 'setting') {
      if (!req.auth!.permissions.has('settings.manage')) throw forbidden('You need settings management permission to review this change.');
      if (input.decision === 'approve') {
        const key = change.payload.key as keyof typeof settingSchemas;
        const schema = settingSchemas[key];
        if (!schema) throw conflict('The setting is no longer supported.');
        const proposed = parse(schema, change.payload.value);
        const current = await one<{ value: unknown }>('SELECT value FROM app_settings WHERE key = $1 FOR UPDATE', [key], client);
        if (!current) throw conflict('The setting no longer exists.');
        if (JSON.stringify(current.value) !== JSON.stringify(change.previous_value)) throw conflict('The setting changed after this request was submitted. Submit a new request against the current value.');
        const latest = await one<{ version: number }>('SELECT max(version)::int AS version FROM governance_policy_versions WHERE setting_key = $1', [key], client);
        const version = (latest?.version ?? 0) + 1;
        await client.query('UPDATE app_settings SET value = $2, updated_by = $3, updated_at = now() WHERE key = $1', [key, proposed, change.requested_by]);
        await client.query(
          `INSERT INTO governance_policy_versions (setting_key, version, value, change_request_id, requested_by, approved_by)
           VALUES ($1, $2, $3, $4, $5, $6)`, [key, version, proposed, change.id, change.requested_by, req.auth!.userId],
        );
      }
    } else if (change.change_type === 'access') {
      if (!req.auth!.permissions.has('permissions.manage')) throw forbidden('You need permissions management access to review this change.');
      if (change.entity_id === req.auth!.userId) throw forbidden('A staff member cannot review a change to their own access.');
      if (input.decision === 'approve') {
        const target = await one<any>(`
          SELECT u.id, u.role, u.approval_limit,
                 COALESCE((SELECT array_agg(permission_id ORDER BY permission_id) FROM user_permissions WHERE user_id = u.id AND effect = 'grant'), '{}') AS grants,
                 COALESCE((SELECT array_agg(permission_id ORDER BY permission_id) FROM user_permissions WHERE user_id = u.id AND effect = 'deny'), '{}') AS denies,
                 COALESCE((SELECT array_agg(product_id ORDER BY product_id) FROM user_product_access WHERE user_id = u.id), '{}') AS product_ids
            FROM users u WHERE u.id = $1 AND u.role <> 'customer' FOR UPDATE`, [change.entity_id], client);
        if (!target) throw conflict('The target staff account no longer exists.');
        if (target.role === 'admin' && change.payload.role !== 'admin') {
          const remainingAdmins = await one<{ count: number }>(`SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND is_active AND id <> $1`, [target.id], client);
          if (!remainingAdmins?.count) throw conflict('This is the last active administrator. Create another administrator before demoting this account.');
        }
        const snapshot = { role: target.role, grants: target.grants, denies: target.denies, productIds: target.product_ids, approvalLimit: target.approval_limit };
        if (JSON.stringify(snapshot) !== JSON.stringify(change.previous_value)) throw conflict('The staff member’s access changed after this request was submitted. Submit a new request against the current access.');
        if ((target.role === 'admin' || change.payload.role === 'admin') && (!req.auth!.permissions.has('permissions.manage') || requester?.role !== 'admin')) {
          throw forbidden('Administrator access changes must be requested by an administrator and independently approved by a permissions manager.');
        }
        if (change.payload.role === 'admin' && requester?.role !== 'admin') throw conflict('Only an administrator may request administrator access.');
        if (change.payload.role !== 'admin') {
          const defaults = await many<{ permission_id: Permission }>('SELECT permission_id FROM role_permissions WHERE role_id = $1', [change.payload.role], client);
          const proposedPermissions = new Set<Permission>([...defaults.map(row => row.permission_id), ...(change.payload.grants as Permission[])].filter(permission => !(change.payload.denies as Permission[]).includes(permission)));
          const escalation = [...proposedPermissions].filter(permission => !requesterPermissions.has(permission));
          if (escalation.length) throw conflict(`The request would grant permissions the requester no longer holds: ${escalation.join(', ')}.`);
        }
        await client.query('UPDATE users SET role = $2, approval_limit = $3, updated_at = now() WHERE id = $1', [target.id, change.payload.role, change.payload.approvalLimit]);
        await client.query('DELETE FROM user_permissions WHERE user_id = $1', [target.id]);
        for (const permission of change.payload.grants as string[]) {
          await client.query(`INSERT INTO user_permissions (user_id, permission_id, effect, granted_by) VALUES ($1, $2, 'grant', $3)`, [target.id, permission, change.requested_by]);
        }
        for (const permission of change.payload.denies as string[]) {
          await client.query(`INSERT INTO user_permissions (user_id, permission_id, effect, granted_by) VALUES ($1, $2, 'deny', $3)`, [target.id, permission, change.requested_by]);
        }
        await client.query('DELETE FROM user_product_access WHERE user_id = $1', [target.id]);
        for (const productId of change.payload.productIds as string[]) {
          await client.query('INSERT INTO user_product_access (user_id, product_id, granted_by) VALUES ($1, $2, $3)', [target.id, productId, change.requested_by]);
        }
      }
    } else if (change.change_type === 'product') {
      if (!req.auth!.permissions.has('products.manage')) throw forbidden('You need product management permission to review this change.');
      if (input.decision === 'approve') {
        if (change.payload.operation === 'create') {
          const product = parse(productCreateSchema, change.payload.product);
          const duplicate = await one('SELECT id FROM loan_products WHERE code = $1 OR id = $2', [product.code, change.entity_id], client);
          if (duplicate) throw conflict('A product with this code or identifier already exists.');
          await client.query(
            `INSERT INTO loan_products (id, code, name, category, borrower_type, description, min_amount, max_amount, min_term_months,
                                        max_term_months, interest_method, interest_rate_monthly, repayment_frequency, fees, required_documents,
                                        members_only, collateral_required, collateral_notes, terms_confirmed, effective_from, effective_to,
                                        status, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'draft',$22,$22)`,
            [change.entity_id, product.code, product.name, product.category, product.borrowerType, product.description ?? '', product.minAmount ?? null,
              product.maxAmount ?? null, product.minTermMonths ?? null, product.maxTermMonths ?? null, product.interestMethod ?? 'reducing_balance',
              product.interestRateMonthly ?? null, product.repaymentFrequency ?? 'monthly', JSON.stringify(product.fees ?? []),
              product.requiredDocuments ?? [], product.membersOnly ?? product.borrowerType === 'business', product.collateralRequired ?? false,
              product.collateralNotes ?? null, product.termsConfirmed ?? false, product.effectiveFrom ?? null, product.effectiveTo ?? null,
              change.requested_by],
          );
        } else if (change.payload.operation === 'update') {
          const current = await one<ProductRow>('SELECT * FROM loan_products WHERE id = $1 FOR UPDATE', [change.entity_id], client);
          if (!current) throw conflict('The product no longer exists.');
          const normalize = (value: any): any => value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
          if (JSON.stringify(normalize(current)) !== JSON.stringify(normalize(change.previous_value))) throw conflict('The product changed after this request was submitted. Submit a new request against the current product.');
          const patch = parse(productUpdateSchema, change.payload.patch);
          const next = { ...current } as ProductRow & Record<string, unknown>;
          for (const [key, value] of Object.entries(patch)) next[PRODUCT_COLUMN_FOR[key]] = value as never;
          if (next.status === 'active') {
            const blockers = activationBlockers(next);
            if (blockers.length) throw conflict(`This product cannot be activated: ${blockers.join(' ')}`);
          }
          if (next.min_amount !== null && next.max_amount !== null && next.min_amount > next.max_amount) throw conflict('Minimum amount is above maximum amount.');
          if (next.min_term_months !== null && next.max_term_months !== null && next.min_term_months > next.max_term_months) throw conflict('Minimum term is above maximum term.');
          const entries = Object.entries(patch);
          const sets = entries.map(([key], index) => `${PRODUCT_COLUMN_FOR[key]} = $${index + 2}`);
          const values = entries.map(([key, value]) => key === 'fees' ? JSON.stringify(value) : value);
          await client.query(
            `UPDATE loan_products SET ${sets.join(', ')}, updated_by = $${entries.length + 2}, updated_at = now() WHERE id = $1`,
            [current.id, ...values, change.requested_by],
          );
        } else {
          throw conflict('Unsupported product change operation.');
        }
      }
    } else if (change.change_type === 'staff_create') {
      if (!req.auth!.permissions.has('staff.manage')) throw forbidden('You need staff management permission to review this change.');
      if (change.payload.role === 'admin' && (!req.auth!.permissions.has('permissions.manage') || !req.auth!.permissions.has('staff.manage'))) throw forbidden('A permissions manager must approve a new administrator account.');
      if (input.decision === 'approve') {
        if (change.payload.role === 'admin') {
          if (requester?.role !== 'admin') throw conflict('An active administrator must request administrator account creation.');
        }
        const duplicate = await one('SELECT id FROM users WHERE lower(email) = lower($1) OR id = $2', [change.payload.email, change.entity_id], client);
        if (duplicate) throw conflict('The proposed staff email or account ID already exists. Submit a new request with different details.');
        await client.query(
          `INSERT INTO users (id, email, password_hash, name, role, phone, staff_title, must_change_password)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
          [change.entity_id, change.payload.email, change.payload.passwordHash, change.payload.fullName, change.payload.role, change.payload.phone ?? null, change.payload.staffTitle ?? null],
        );
      }
    } else {
      throw conflict('Unsupported governance request type.');
    }

    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    await client.query(`UPDATE governance_change_requests SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4 WHERE id = $1`, [change.id, status, req.auth!.userId, input.note]);
    await client.query(`INSERT INTO governance_change_events (request_id, actor_id, event_type, note) VALUES ($1, $2, $3, $4)`, [change.id, req.auth!.userId, status, input.note]);
    await audit(req, {
      action: `governance.change_${status}`, entityType: change.change_type, entityId: change.entity_id,
      summary: `${status === 'approved' ? 'Approved' : 'Rejected'} governance change ${change.id}.`,
      metadata: { requestId: change.id, requestedBy: change.requested_by, note: input.note },
    }, client);
    return { id: change.id, status };
  });
  res.json(result);
}));

governanceRouter.get('/governance/policies/:key/history', requirePermission('settings.manage'), route(async (req, res) => {
  const rows = await many(`
    SELECT v.setting_key, v.version, v.value, v.effective_at, v.requested_by, requester.name AS requester_name,
           v.approved_by, approver.name AS approver_name, v.change_request_id
      FROM governance_policy_versions v
      LEFT JOIN users requester ON requester.id = v.requested_by
      LEFT JOIN users approver ON approver.id = v.approved_by
     WHERE v.setting_key = $1 ORDER BY v.version DESC LIMIT 100`, [req.params.key]);
  res.json(rows.map(row => ({ key: row.setting_key, version: row.version, value: row.value, effectiveAt: row.effective_at, requestedBy: row.requester_name, approvedBy: row.approver_name, requestId: row.change_request_id })));
}));
