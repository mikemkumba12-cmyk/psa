import type { Request } from 'express';
import { pool, type Queryable } from '../db/pool';
import { newId } from './ids';
import { clientIp } from './http';

export interface AuditActor {
  id: string;
  name: string;
  role: string;
}

export interface AuditEntry {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome?: 'success' | 'failure' | 'denied';
  summary: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

export const SYSTEM_ACTOR: AuditActor = { id: 'system', name: 'System', role: 'system' };

/** Identity of the authenticated user, taken from the verified session — never from request headers. */
export function actorFrom(req: Request): AuditActor {
  if (req.auth) return { id: req.auth.userId, name: req.auth.fullName, role: req.auth.role };
  return { id: 'anonymous', name: 'Anonymous', role: 'anonymous' };
}

export async function recordAudit(entry: AuditEntry, client: Queryable = pool): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, entity_type, entity_id, outcome, summary, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      newId('aud'),
      entry.actor.id,
      entry.actor.name,
      entry.actor.role,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.outcome ?? 'success',
      entry.summary,
      entry.metadata ?? {},
      entry.ip ?? null,
    ],
  );
}

/** Convenience wrapper for route handlers. */
export function audit(req: Request, entry: Omit<AuditEntry, 'actor' | 'ip'>, client?: Queryable): Promise<void> {
  return recordAudit({ ...entry, actor: actorFrom(req), ip: clientIp(req) }, client);
}
