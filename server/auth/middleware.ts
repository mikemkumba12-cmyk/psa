import type { NextFunction, Request, Response } from 'express';
import { one, query } from '../db/pool';
import { forbidden, unauthorized } from '../lib/http';
import { verifyToken } from './tokens';
import { isStaffRole, loadEffectivePermissions, type Permission } from './permissions';

export interface AuthContext {
  userId: string;
  sessionId: string;
  role: string;
  fullName: string;
  email: string;
  isStaff: boolean;
  customerId: string | null;
  approvalLimit: number | null;
  mustChangePassword: boolean;
  permissions: Set<Permission>;
  productAccessCache?: Set<string> | 'all';
}

const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000;

function bearerToken(req: Request): string | null {
  // Tokens are accepted only in the Authorization header. Query-string tokens
  // leak into logs, browser history and Referer headers.
  const header = req.header('Authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

interface SessionRow {
  id: string;
  role: string;
  name: string;
  email: string;
  is_active: boolean;
  token_version: number;
  approval_limit: number | null;
  must_change_password: boolean;
  revoked_at: Date | null;
  expires_at: Date;
  last_seen_at: Date;
  customer_id: string | null;
}

export async function resolveAuth(token: string | null): Promise<AuthContext | null> {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;

  const row = await one<SessionRow>(
    `SELECT u.id, u.role, u.name, u.email, u.is_active, u.token_version, u.approval_limit, u.must_change_password,
            s.revoked_at, s.expires_at, s.last_seen_at, c.id AS customer_id
       FROM users u
       JOIN user_sessions s ON s.user_id = u.id AND s.id = $2
       LEFT JOIN customers c ON c.user_id = u.id
      WHERE u.id = $1`,
    [payload.sub, payload.sid],
  );
  if (!row || !row.is_active || row.revoked_at || row.expires_at.getTime() <= Date.now()) return null;
  if (row.token_version !== payload.tv) return null;

  if (Date.now() - row.last_seen_at.getTime() > LAST_SEEN_REFRESH_MS) {
    await query('UPDATE user_sessions SET last_seen_at = now() WHERE id = $1', [payload.sid]);
  }

  return {
    userId: row.id,
    sessionId: payload.sid,
    role: row.role,
    fullName: row.name,
    email: row.email,
    isStaff: isStaffRole(row.role),
    customerId: row.customer_id,
    approvalLimit: row.approval_limit,
    mustChangePassword: row.must_change_password,
    permissions: await loadEffectivePermissions(row.id, row.role),
  };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = await resolveAuth(bearerToken(req));
    if (!auth) return next(unauthorized('Your session has expired. Please sign in again.'));
    req.auth = auth;
    // Accounts with an administrator-issued temporary password may only reach account endpoints.
    if (auth.mustChangePassword && !req.originalUrl.startsWith('/api/auth/')) {
      return next(forbidden('Change your temporary password before continuing.'));
    }
    next();
  } catch (error) {
    next(error);
  }
}
