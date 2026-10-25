import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { config } from '../config';

const LEGACY_SALT = 'psa_salt_v1';

export async function hashSecret(value: string): Promise<string> {
  return bcrypt.hash(value, config.auth.bcryptRounds);
}

/**
 * Verifies a password or security answer. Accounts created by the earlier
 * prototype used unsalted SHA-256; those still verify once and are flagged for
 * rehashing with bcrypt.
 */
export async function verifySecret(value: string, storedHash: string | null | undefined): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!storedHash) return { valid: false, needsRehash: false };
  if (storedHash.startsWith('$2')) {
    const valid = await bcrypt.compare(value, storedHash);
    return { valid, needsRehash: valid && bcrypt.getRounds(storedHash) < config.auth.bcryptRounds };
  }
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const candidate = Buffer.from(crypto.createHash('sha256').update(value + LEGACY_SALT).digest('hex'));
    const stored = Buffer.from(storedHash.toLowerCase());
    const valid = candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
    return { valid, needsRehash: valid };
  }
  return { valid: false, needsRehash: false };
}

export function normalizeSecurityAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

// The rules live in shared/ so the web app checks exactly what the API enforces.
export { PASSWORD_RULES, passwordProblems } from '../../shared/passwordPolicy';
