/**
 * Creates an administrator account with a one-time temporary password.
 *
 *   npm run create-admin -- "Full Name" admin@example.mw
 *
 * The password is printed once and must be changed at first sign-in.
 * Use this to bootstrap a new installation; afterwards create staff in the portal.
 */
import crypto from 'crypto';
import { hashSecret } from '../server/auth/passwords';
import { one, pool, query } from '../server/db/pool';
import { newId } from '../server/lib/ids';
import { recordAudit, SYSTEM_ACTOR } from '../server/lib/audit';

async function main() {
  const [name, email] = process.argv.slice(2);
  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Usage: npm run create-admin -- "Full Name" email@example.com');
  }
  const existing = await one('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing) throw new Error('An account with this email already exists.');
  const password = `${crypto.randomBytes(9).toString('base64url')}7a`;
  const id = newId('usr');
  await query(
    `INSERT INTO users (id, email, password_hash, name, role, staff_title, must_change_password) VALUES ($1, $2, $3, $4, 'admin', 'System Administrator', TRUE)`,
    [id, email.toLowerCase(), await hashSecret(password), name],
  );
  await recordAudit({ actor: SYSTEM_ACTOR, action: 'staff.create', entityType: 'user', entityId: id, summary: `Administrator ${name} created from the command line.` });
  console.log(`Administrator created: ${email}\nTemporary password (shown once): ${password}`);
}

main().catch(error => { console.error(`[create-admin] ${error.message}`); process.exitCode = 1; }).finally(() => pool.end());
