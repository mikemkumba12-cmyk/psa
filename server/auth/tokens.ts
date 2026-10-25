import crypto from 'crypto';
import { config } from '../config';

/**
 * Compact HMAC-signed bearer tokens: "v2.<payload>.<signature>".
 * The payload only identifies the session; everything else (role, active
 * status, permissions) is re-read from the database on every request, so
 * revoking a session or changing a password takes effect immediately.
 */

export interface TokenPayload {
  sub: string;   // user id
  sid: string;   // session id
  tv: number;    // user token_version at issue time
  iat: number;
  exp: number;
}

function sign(body: string): string {
  return crypto.createHmac('sha256', config.auth.secret).update(body).digest('base64url');
}

export function signToken(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `v2.${body}.${sign(body)}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v2') return null;
  const [, body, signature] = parts;
  const expected = Buffer.from(sign(body));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!payload.sub || !payload.sid || typeof payload.tv !== 'number' || typeof payload.exp !== 'number') return null;
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
