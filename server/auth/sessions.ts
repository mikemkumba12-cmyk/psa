import type { Request } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { many, query, type Queryable, pool } from '../db/pool';
import { clientIp } from '../lib/http';
import { signToken } from './tokens';

export interface IssuedSession {
  token: string;
  sessionId: string;
  expiresAt: string;
}

export async function createSession(
  req: Request,
  user: { id: string; token_version: number },
  authMethod: 'password' | 'passkey' | 'registration',
  client: Queryable = pool,
): Promise<IssuedSession> {
  const sessionId = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  const expiresAt = new Date(now + config.auth.tokenTtlMs);
  await client.query(
    `INSERT INTO user_sessions (id, user_id, auth_method, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, user.id, authMethod, (req.header('User-Agent') || '').slice(0, 500), clientIp(req), expiresAt],
  );
  const token = signToken({ sub: user.id, sid: sessionId, tv: user.token_version, iat: now, exp: expiresAt.getTime() });
  return { token, sessionId, expiresAt: expiresAt.toISOString() };
}

export async function revokeSession(sessionId: string, userId: string, reason: string): Promise<boolean> {
  const result = await query(
    `UPDATE user_sessions SET revoked_at = now(), revoked_reason = $3
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [sessionId, userId, reason],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Revokes every session for a user, optionally keeping one (e.g. the session that changed the password). */
export async function revokeAllSessions(userId: string, reason: string, exceptSessionId?: string, client: Queryable = pool): Promise<number> {
  const result = await client.query(
    `UPDATE user_sessions SET revoked_at = now(), revoked_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL AND ($3::text IS NULL OR id <> $3)`,
    [userId, reason, exceptSessionId ?? null],
  );
  return result.rowCount ?? 0;
}

export async function listActiveSessions(userId: string) {
  return many(
    `SELECT id, auth_method, user_agent, ip_address, created_at, last_seen_at, expires_at
       FROM user_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY last_seen_at DESC`,
    [userId],
  );
}
