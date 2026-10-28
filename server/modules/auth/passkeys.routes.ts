import { Router } from 'express';
import { z } from 'zod';
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticatorTransport,
} from '@simplewebauthn/server';
import { config } from '../../config';
import { many, one, query, transaction } from '../../db/pool';
import { audit, recordAudit } from '../../lib/audit';
import { badRequest, clientIp, notFound, parse, route, unauthorized } from '../../lib/http';
import { newId } from '../../lib/ids';
import { rateLimit } from '../../lib/rateLimit';
import { requireAuth } from '../../auth/middleware';
import { createSession } from '../../auth/sessions';
import { loadProfile } from './profile';

/**
 * Passkeys (WebAuthn). The fingerprint / face / PIN check happens on the user's
 * device; the server only ever receives a public key and signed challenges.
 * No biometric data is collected or stored.
 */
export const passkeysRouter = Router();

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

async function storeChallenge(challenge: string, purpose: 'register' | 'login', userId: string | null): Promise<string> {
  const id = newId('chl');
  await query('INSERT INTO auth_challenges (id, user_id, purpose, challenge, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [id, userId, purpose, challenge, new Date(Date.now() + CHALLENGE_TTL_MS)]);
  return id;
}

async function takeChallenge(id: string, purpose: 'register' | 'login', userId: string | null): Promise<string> {
  const row = await one<{ challenge: string }>(
    `DELETE FROM auth_challenges WHERE id = $1 AND purpose = $2 AND expires_at > now() AND user_id IS NOT DISTINCT FROM $3 RETURNING challenge`,
    [id, purpose, userId],
  );
  if (!row) throw badRequest('This passkey request has expired. Try again.');
  return row.challenge;
}

// ── Registration (signed in) ─────────────────────────────────────────────────

passkeysRouter.post('/passkeys/register/options', requireAuth, route(async (req, res) => {
  const auth = req.auth!;
  const existing = await many<{ id: string; transports: string[] }>('SELECT id, transports FROM webauthn_credentials WHERE user_id = $1', [auth.userId]);
  const options = await generateRegistrationOptions({
    rpName: config.webauthn.rpName,
    rpID: config.webauthn.rpId,
    userName: auth.email,
    userDisplayName: auth.fullName,
    userID: new TextEncoder().encode(auth.userId),
    attestationType: 'none',
    excludeCredentials: existing.map(item => ({ id: item.id, transports: item.transports as AuthenticatorTransport[] })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  const challengeId = await storeChallenge(options.challenge, 'register', auth.userId);
  res.json({ challengeId, options });
}));

passkeysRouter.post('/passkeys/register/verify', requireAuth, route(async (req, res) => {
  const input = parse(z.object({ challengeId: z.string(), response: z.any(), label: z.string().trim().max(120).optional() }), req.body);
  const auth = req.auth!;
  const expectedChallenge = await takeChallenge(input.challengeId, 'register', auth.userId);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge,
      expectedOrigin: config.webauthn.origins,
      expectedRPID: config.webauthn.rpId,
      requireUserVerification: true,
    });
  } catch (error: any) {
    throw badRequest(`The passkey could not be verified: ${error?.message || 'unknown error'}`);
  }
  if (!verification.verified) throw badRequest('The passkey could not be verified.');
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  await transaction(async client => {
    await client.query(
      `INSERT INTO webauthn_credentials (id, user_id, public_key, counter, transports, device_type, backed_up, label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [credential.id, auth.userId, Buffer.from(credential.publicKey), credential.counter, credential.transports ?? [],
        credentialDeviceType, credentialBackedUp, input.label || 'Passkey'],
    );
    await audit(req, { action: 'account.passkey_add', entityType: 'user', entityId: auth.userId, summary: 'Added a passkey for biometric sign-in.' }, client);
  });
  res.status(201).json({ id: credential.id, label: input.label || 'Passkey' });
}));

passkeysRouter.get('/passkeys', requireAuth, route(async (req, res) => {
  const rows = await many('SELECT id, label, device_type, backed_up, created_at, last_used_at FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at', [req.auth!.userId]);
  res.json(rows.map(row => ({ id: row.id, label: row.label, deviceType: row.device_type, backedUp: row.backed_up, createdAt: row.created_at, lastUsedAt: row.last_used_at })));
}));

passkeysRouter.delete('/passkeys/:id', requireAuth, route(async (req, res) => {
  const result = await query('DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2', [req.params.id, req.auth!.userId]);
  if (!result.rowCount) throw notFound('Passkey not found.');
  await audit(req, { action: 'account.passkey_remove', entityType: 'user', entityId: req.auth!.userId, summary: 'Removed a passkey.' });
  res.status(204).end();
}));

// ── Sign in with a passkey (not signed in) ───────────────────────────────────

passkeysRouter.post('/passkeys/login/options', rateLimit('passkey-options', 30, 15 * 60 * 1000), route(async (_req, res) => {
  const options = await generateAuthenticationOptions({ rpID: config.webauthn.rpId, userVerification: 'required' });
  const challengeId = await storeChallenge(options.challenge, 'login', null);
  res.json({ challengeId, options });
}));

passkeysRouter.post('/passkeys/login/verify', rateLimit('passkey-verify', 20, 15 * 60 * 1000), route(async (req, res) => {
  const input = parse(z.object({ challengeId: z.string(), response: z.object({ id: z.string() }).passthrough() }), req.body);
  const expectedChallenge = await takeChallenge(input.challengeId, 'login', null);
  const stored = await one(
    `SELECT c.id, c.user_id, c.public_key, c.counter, c.transports, u.name, u.role, u.is_active, u.token_version
       FROM webauthn_credentials c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [input.response.id],
  );
  if (!stored) throw unauthorized('This passkey is not registered. Sign in with your password.');
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response as any,
      expectedChallenge,
      expectedOrigin: config.webauthn.origins,
      expectedRPID: config.webauthn.rpId,
      credential: { id: stored.id, publicKey: new Uint8Array(stored.public_key), counter: Number(stored.counter), transports: stored.transports },
      requireUserVerification: true,
    });
  } catch {
    verification = { verified: false } as const;
  }
  if (!verification.verified) {
    await recordAudit({ actor: { id: stored.user_id, name: stored.name, role: stored.role }, action: 'auth.passkey_failed', entityType: 'user', entityId: stored.user_id, outcome: 'failure', summary: 'Passkey sign-in failed verification.', ip: clientIp(req) });
    throw unauthorized('Passkey sign-in failed.');
  }
  if (!stored.is_active) throw unauthorized('This account has been deactivated. Contact an administrator.');
  await query('UPDATE webauthn_credentials SET counter = $2, last_used_at = now() WHERE id = $1', [stored.id, verification.authenticationInfo.newCounter]);
  await query('UPDATE users SET last_login_at = now(), failed_login_count = 0 WHERE id = $1', [stored.user_id]);
  const session = await createSession(req, { id: stored.user_id, token_version: stored.token_version }, 'passkey');
  await recordAudit({ actor: { id: stored.user_id, name: stored.name, role: stored.role }, action: 'auth.login', entityType: 'user', entityId: stored.user_id, summary: 'Signed in with a passkey.', ip: clientIp(req) });
  res.json({ ...session, profile: await loadProfile(stored.user_id) });
}));
