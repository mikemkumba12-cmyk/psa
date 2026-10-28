import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { one, query, transaction } from '../../db/pool';
import { audit, recordAudit } from '../../lib/audit';
import { badRequest, clientIp, conflict, notFound, parse, route, unauthorized } from '../../lib/http';
import { newId, randomToken, sha256Hex } from '../../lib/ids';
import { rateLimit } from '../../lib/rateLimit';
import { requireAuth } from '../../auth/middleware';
import { hashSecret, normalizeSecurityAnswer, passwordProblems, verifySecret } from '../../auth/passwords';
import { createSession, listActiveSessions, revokeAllSessions, revokeSession } from '../../auth/sessions';
import { loadProfile } from './profile';

export const authRouter = Router();

const optionalText = (max: number) => z.string().trim().max(max).optional().transform(value => value || null);

const passwordField = z.string().min(1, 'Password is required.').max(128);

const registerSchema = z.object({
  fullName: z.string().trim().min(3, 'Enter your full name.').max(255),
  email: z.email('Enter a valid email address.').transform(value => value.toLowerCase()),
  phone: z.string().trim().min(7, 'Enter a valid phone number.').max(50),
  nationalId: z.string().trim().min(5, 'Enter your national ID number.').max(100),
  password: passwordField,
  securityQuestion: z.string().trim().min(5).max(255),
  securityAnswer: z.string().trim().min(2).max(255),
  dateOfBirth: z.iso.date().optional(),
  gender: optionalText(30),
  address: optionalText(500),
  district: optionalText(100),
  employmentType: optionalText(50),
  employerName: optionalText(255),
  employeeNumber: optionalText(100),
  monthlyIncome: z.coerce.number().nonnegative().max(1e12).optional(),
  segment: z.enum(['individual', 'sme']).default('individual'),
});

const PASSWORD_ERROR = 'Choose a stronger password.';

authRouter.post('/register', rateLimit('register', 30, 15 * 60 * 1000), route(async (req, res) => {
  const input = parse(registerSchema, req.body);
  const problems = passwordProblems(input.password, { email: input.email });
  if (problems.length) throw badRequest(PASSWORD_ERROR, problems.map(message => ({ field: 'password', message })));

  const existing = await one(
    `SELECT
       EXISTS (SELECT 1 FROM users WHERE lower(email) = $1) AS email_taken,
       EXISTS (SELECT 1 FROM customers WHERE upper(national_id) = upper($2)) AS id_taken`,
    [input.email, input.nationalId],
  );
  if (existing?.email_taken) throw conflict('An account with this email already exists. Try signing in instead.', [{ field: 'email', message: 'Already registered.' }]);
  if (existing?.id_taken) {
    throw conflict('This national ID is already registered. If you are an existing client, use "Activate account" or contact the branch.', [{ field: 'nationalId', message: 'Already registered.' }]);
  }

  const passwordHash = await hashSecret(input.password);
  const answerHash = await hashSecret(normalizeSecurityAnswer(input.securityAnswer));
  const userId = newId('usr');
  const customerId = newId('cus');

  const session = await transaction(async client => {
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, phone, security_question, security_answer_hash, password_changed_at)
       VALUES ($1, $2, $3, $4, 'customer', $5, $6, $7, now())`,
      [userId, input.email, passwordHash, input.fullName, input.phone, input.securityQuestion, answerHash],
    );
    await client.query(
      `INSERT INTO customers (id, user_id, name, phone, email, national_id, date_of_birth, gender, address, location,
                              employment_type, employer_name, employee_number, monthly_income, segment, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'Active', $2)`,
      [customerId, userId, input.fullName, input.phone, input.email, input.nationalId, input.dateOfBirth ?? null,
        input.gender, input.address, input.district, input.employmentType, input.employerName, input.employeeNumber,
        input.monthlyIncome ?? null, input.segment],
    );
    await recordAudit({
      actor: { id: userId, name: input.fullName, role: 'customer' },
      action: 'auth.register',
      entityType: 'user',
      entityId: userId,
      summary: 'Customer registered a portal account.',
      metadata: { customerId, segment: input.segment },
      ip: clientIp(req),
    }, client);
    return createSession(req, { id: userId, token_version: 0 }, 'registration', client);
  });

  res.status(201).json({ ...session, profile: await loadProfile(userId) });
}));

const activateSchema = z.object({
  nationalId: z.string().trim().min(5).max(100),
  employeeNumber: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(7).max(50),
  email: z.email().transform(value => value.toLowerCase()),
  password: passwordField,
  securityQuestion: z.string().trim().min(5).max(255),
  securityAnswer: z.string().trim().min(2).max(255),
});

function digitsOnly(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '').slice(-9);
}

/**
 * Lets an existing client who was added by staff (no portal account yet) create one.
 * All three identifiers must match the record on file; the response never reveals which one did not.
 */
authRouter.post('/activate', rateLimit('activate', 5, 15 * 60 * 1000), route(async (req, res) => {
  const input = parse(activateSchema, req.body);
  const genericFailure = badRequest('We could not match these details to a client record. Check them or contact your branch.');

  const customer = await one(
    `SELECT id, name, phone, user_id FROM customers
      WHERE upper(national_id) = upper($1) AND upper(employee_number) = upper($2)`,
    [input.nationalId, input.employeeNumber],
  );
  if (!customer || digitsOnly(customer.phone) !== digitsOnly(input.phone)) {
    await recordAudit({
      actor: { id: 'anonymous', name: 'Anonymous', role: 'anonymous' },
      action: 'auth.activate_failed', entityType: 'customer', outcome: 'failure',
      summary: 'Account activation attempt did not match a client record.', ip: clientIp(req),
    });
    throw genericFailure;
  }
  if (customer.user_id) throw conflict('This client already has a portal account. Sign in or reset your password.');

  const problems = passwordProblems(input.password, { email: input.email });
  if (problems.length) throw badRequest(PASSWORD_ERROR, problems.map(message => ({ field: 'password', message })));
  const emailTaken = await one('SELECT 1 FROM users WHERE lower(email) = $1', [input.email]);
  if (emailTaken) throw conflict('An account with this email already exists.');

  const userId = newId('usr');
  const passwordHash = await hashSecret(input.password);
  const answerHash = await hashSecret(normalizeSecurityAnswer(input.securityAnswer));
  const session = await transaction(async client => {
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, phone, security_question, security_answer_hash, password_changed_at)
       VALUES ($1, $2, $3, $4, 'customer', $5, $6, $7, now())`,
      [userId, input.email, passwordHash, customer.name, input.phone, input.securityQuestion, answerHash],
    );
    await client.query(
      'UPDATE customers SET user_id = $1, email = COALESCE(email, $2), is_activated = TRUE, updated_at = now() WHERE id = $3',
      [userId, input.email, customer.id],
    );
    await recordAudit({
      actor: { id: userId, name: customer.name, role: 'customer' },
      action: 'auth.activate', entityType: 'customer', entityId: customer.id,
      summary: 'Existing client activated a portal account.', ip: clientIp(req),
    }, client);
    return createSession(req, { id: userId, token_version: 0 }, 'registration', client);
  });
  res.status(201).json({ ...session, profile: await loadProfile(userId) });
}));

const loginSchema = z.object({
  email: z.string().trim().min(1).max(255).transform(value => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

let dummyHash: string | undefined;

authRouter.post('/login', rateLimit('login', 20, 15 * 60 * 1000), route(async (req, res) => {
  const input = parse(loginSchema, req.body);
  const invalid = unauthorized('Incorrect email or password.');

  const user = await one(
    `SELECT id, name, role, password_hash, is_active, token_version, failed_login_count, locked_until
       FROM users WHERE lower(email) = $1`,
    [input.email],
  );
  if (!user) {
    // Spend comparable time so response timing does not reveal whether the email exists.
    dummyHash ??= await hashSecret(randomToken());
    await verifySecret(input.password, dummyHash);
    throw invalid;
  }
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    throw unauthorized('This account is temporarily locked after several failed sign-in attempts. Try again later.');
  }

  const check = await verifySecret(input.password, user.password_hash);
  if (!check.valid) {
    const failures = user.failed_login_count + 1;
    const lock = failures >= config.auth.maxFailedLogins;
    await query(
      `UPDATE users SET failed_login_count = $2,
              locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
        WHERE id = $1`,
      [user.id, lock ? 0 : failures, lock, config.auth.lockoutMinutes],
    );
    await recordAudit({
      actor: { id: user.id, name: user.name, role: user.role },
      action: lock ? 'auth.locked' : 'auth.login_failed', entityType: 'user', entityId: user.id, outcome: 'failure',
      summary: lock ? 'Account locked after repeated failed sign-ins.' : 'Failed sign-in attempt.', ip: clientIp(req),
    });
    throw invalid;
  }
  if (!user.is_active) throw unauthorized('This account has been deactivated. Contact an administrator.');

  if (check.needsRehash) {
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, await hashSecret(input.password)]);
  }
  await query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
  const session = await createSession(req, user, 'password');
  await recordAudit({
    actor: { id: user.id, name: user.name, role: user.role },
    action: 'auth.login', entityType: 'user', entityId: user.id, summary: 'Signed in with password.', ip: clientIp(req),
  });
  res.json({ ...session, profile: await loadProfile(user.id) });
}));

// ── Password reset with security question ───────────────────────────────────
// Email/SMS reset links need a configured provider; until then the security question is the fallback.

authRouter.post('/forgot-password/question', rateLimit('forgot-question', 10, 15 * 60 * 1000), route(async (req, res) => {
  const { email } = parse(z.object({ email: z.string().trim().toLowerCase() }), req.body);
  const user = await one('SELECT security_question FROM users WHERE lower(email) = $1 AND is_active', [email]);
  // A generic question is returned for unknown emails so this endpoint cannot be used to discover accounts.
  res.json({ securityQuestion: user?.security_question || 'What city were you born in?' });
}));

authRouter.post('/forgot-password/verify', rateLimit('forgot-verify', 5, 15 * 60 * 1000), route(async (req, res) => {
  const input = parse(z.object({ email: z.string().trim().toLowerCase(), answer: z.string().min(1).max(255) }), req.body);
  const user = await one('SELECT id, name, role, security_answer_hash FROM users WHERE lower(email) = $1 AND is_active', [input.email]);
  const check = await verifySecret(normalizeSecurityAnswer(input.answer), user?.security_answer_hash);
  if (!user || !check.valid) throw badRequest('That answer does not match our records.');

  const resetToken = randomToken();
  const expiresAt = new Date(Date.now() + config.auth.passwordResetTtlMs);
  await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
  await query('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [sha256Hex(resetToken), user.id, expiresAt]);
  await recordAudit({
    actor: { id: user.id, name: user.name, role: user.role },
    action: 'auth.password_reset_verified', entityType: 'user', entityId: user.id,
    summary: 'Security answer verified for password reset.', ip: clientIp(req),
  });
  res.json({ resetToken, expiresAt: expiresAt.toISOString() });
}));

authRouter.post('/forgot-password/reset', rateLimit('forgot-reset', 5, 15 * 60 * 1000), route(async (req, res) => {
  const input = parse(z.object({ resetToken: z.string().min(10), newPassword: passwordField }), req.body);
  const record = await one(
    `SELECT t.user_id, u.email, u.name, u.role FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()`,
    [sha256Hex(input.resetToken)],
  );
  if (!record) throw badRequest('This reset link has expired. Start again.');
  const problems = passwordProblems(input.newPassword, { email: record.email });
  if (problems.length) throw badRequest(PASSWORD_ERROR, problems.map(message => ({ field: 'newPassword', message })));

  await transaction(async client => {
    await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1', [sha256Hex(input.resetToken)]);
    await client.query(
      `UPDATE users SET password_hash = $2, token_version = token_version + 1, password_changed_at = now(),
              failed_login_count = 0, locked_until = NULL, must_change_password = FALSE
        WHERE id = $1`,
      [record.user_id, await hashSecret(input.newPassword)],
    );
    await revokeAllSessions(record.user_id, 'password_reset', undefined, client);
    await recordAudit({
      actor: { id: record.user_id, name: record.name, role: record.role },
      action: 'auth.password_reset', entityType: 'user', entityId: record.user_id,
      summary: 'Password reset; all sessions signed out.', ip: clientIp(req),
    }, client);
  });
  res.json({ success: true });
}));

// ── Authenticated account endpoints ──────────────────────────────────────────

authRouter.get('/me', requireAuth, route(async (req, res) => {
  const profile = await loadProfile(req.auth!.userId);
  if (!profile) throw notFound('Account not found.');
  res.json(profile);
}));

const profileUpdateSchema = z.object({
  phone: z.string().trim().min(7).max(50).optional(),
  address: z.string().trim().max(500).optional(),
  district: z.string().trim().max(100).optional(),
  employmentType: z.string().trim().max(50).optional(),
  employerName: z.string().trim().max(255).optional(),
  monthlyIncome: z.coerce.number().nonnegative().max(1e12).optional(),
  notificationPrefs: z.object({ sms: z.boolean(), email: z.boolean(), inApp: z.boolean() }).optional(),
}).strict();

authRouter.patch('/me', requireAuth, route(async (req, res) => {
  const input = parse(profileUpdateSchema, req.body);
  const auth = req.auth!;
  await transaction(async client => {
    if (input.phone !== undefined || input.notificationPrefs !== undefined) {
      await client.query(
        `UPDATE users SET phone = COALESCE($2, phone), notification_prefs = COALESCE($3, notification_prefs), updated_at = now()
          WHERE id = $1`,
        [auth.userId, input.phone ?? null, input.notificationPrefs ?? null],
      );
    }
    if (auth.customerId) {
      await client.query(
        `UPDATE customers SET
           phone = COALESCE($2, phone), address = COALESCE($3, address), location = COALESCE($4, location),
           employment_type = COALESCE($5, employment_type), employer_name = COALESCE($6, employer_name),
           monthly_income = COALESCE($7, monthly_income), updated_at = now()
         WHERE id = $1`,
        [auth.customerId, input.phone ?? null, input.address ?? null, input.district ?? null,
          input.employmentType ?? null, input.employerName ?? null, input.monthlyIncome ?? null],
      );
    }
    await audit(req, {
      action: 'account.profile_update', entityType: 'user', entityId: auth.userId,
      summary: 'Updated own profile.', metadata: { fields: Object.keys(input) },
    }, client);
  });
  res.json(await loadProfile(auth.userId));
}));

authRouter.post('/change-password', requireAuth, rateLimit('change-password', 10, 15 * 60 * 1000), route(async (req, res) => {
  const input = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordField }), req.body);
  const auth = req.auth!;
  const user = await one('SELECT password_hash, token_version FROM users WHERE id = $1', [auth.userId]);
  const check = await verifySecret(input.currentPassword, user?.password_hash);
  if (!user || !check.valid) {
    await audit(req, { action: 'account.password_change_failed', entityType: 'user', entityId: auth.userId, outcome: 'failure', summary: 'Current password was incorrect.' });
    throw badRequest('Your current password is incorrect.', [{ field: 'currentPassword', message: 'Incorrect password.' }]);
  }
  if (input.currentPassword === input.newPassword) {
    throw badRequest('Choose a password you have not just used.', [{ field: 'newPassword', message: 'Must differ from the current password.' }]);
  }
  const problems = passwordProblems(input.newPassword, { email: auth.email });
  if (problems.length) throw badRequest(PASSWORD_ERROR, problems.map(message => ({ field: 'newPassword', message })));

  const newHash = await hashSecret(input.newPassword);
  const session = await transaction(async client => {
    const updated = await client.query<{ token_version: number }>(
      `UPDATE users SET password_hash = $2, token_version = token_version + 1, password_changed_at = now(),
              must_change_password = FALSE, updated_at = now()
        WHERE id = $1 RETURNING token_version`,
      [auth.userId, newHash],
    );
    // Every existing session (including this one) is invalidated by the token_version bump;
    // the caller gets a fresh session so they stay signed in here.
    await revokeAllSessions(auth.userId, 'password_changed', undefined, client);
    await audit(req, {
      action: 'account.password_change', entityType: 'user', entityId: auth.userId,
      summary: 'Changed password; all other sessions signed out.',
    }, client);
    return createSession(req, { id: auth.userId, token_version: updated.rows[0].token_version }, 'password', client);
  });
  res.json({ ...session, message: 'Password changed. Other devices have been signed out.' });
}));

authRouter.post('/logout', requireAuth, route(async (req, res) => {
  await revokeSession(req.auth!.sessionId, req.auth!.userId, 'logout');
  await audit(req, { action: 'auth.logout', entityType: 'user', entityId: req.auth!.userId, summary: 'Signed out.' });
  res.status(204).end();
}));

authRouter.get('/sessions', requireAuth, route(async (req, res) => {
  const sessions = await listActiveSessions(req.auth!.userId);
  res.json(sessions.map(session => ({
    id: session.id,
    current: session.id === req.auth!.sessionId,
    authMethod: session.auth_method,
    userAgent: session.user_agent,
    ipAddress: session.ip_address,
    createdAt: session.created_at,
    lastSeenAt: session.last_seen_at,
    expiresAt: session.expires_at,
  })));
}));

authRouter.delete('/sessions/:id', requireAuth, route(async (req, res) => {
  const revoked = await revokeSession(req.params.id, req.auth!.userId, 'revoked_by_user');
  if (!revoked) throw notFound('Session not found.');
  await audit(req, { action: 'account.session_revoke', entityType: 'session', entityId: req.params.id, summary: 'Signed out a session.' });
  res.status(204).end();
}));

authRouter.post('/sessions/revoke-others', requireAuth, route(async (req, res) => {
  const count = await revokeAllSessions(req.auth!.userId, 'revoked_by_user', req.auth!.sessionId);
  await audit(req, { action: 'account.session_revoke_others', entityType: 'user', entityId: req.auth!.userId, summary: `Signed out ${count} other session(s).` });
  res.json({ revoked: count });
}));
