import { Router } from 'express';
import { z } from 'zod';
import { many, one } from '../../db/pool';
import { parse, route } from '../../lib/http';
import { requirePermission } from '../../auth/permissions';

export const auditRouter = Router();

auditRouter.get('/audit-logs', requirePermission('audit.view'), route(async (req, res) => {
  const input = parse(z.object({
    action: z.string().trim().max(100).optional(),
    entityType: z.string().trim().max(50).optional(),
    entityId: z.string().trim().max(100).optional(),
    actorId: z.string().trim().max(100).optional(),
    outcome: z.enum(['success', 'failure', 'denied']).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(10).max(200).default(50),
  }), req.query);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => { params.push(value); conditions.push(sql.replace('?', `$${params.length}`)); };
  if (input.action) add('action LIKE ?', `${input.action}%`);
  if (input.entityType) add('entity_type = ?', input.entityType);
  if (input.entityId) add('entity_id = ?', input.entityId);
  if (input.actorId) add('actor_id = ?', input.actorId);
  if (input.outcome) add('outcome = ?', input.outcome);
  if (input.from) add('occurred_at >= ?::date', input.from);
  if (input.to) add(`occurred_at < (?::date + interval '1 day')`, input.to);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM audit_logs ${where}`, params);
  params.push(input.pageSize, (input.page - 1) * input.pageSize);
  const rows = await many(
    `SELECT id, occurred_at, actor_id, actor_name, actor_role, action, entity_type, entity_id, outcome, summary, metadata, ip_address
       FROM audit_logs ${where} ORDER BY occurred_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({
    total: total?.n ?? 0, page: input.page, pageSize: input.pageSize,
    items: rows.map(row => ({
      id: row.id, occurredAt: row.occurred_at, actorId: row.actor_id, actorName: row.actor_name, actorRole: row.actor_role,
      action: row.action, entityType: row.entity_type, entityId: row.entity_id, outcome: row.outcome, summary: row.summary,
      metadata: row.metadata, ipAddress: row.ip_address,
    })),
  });
}));
