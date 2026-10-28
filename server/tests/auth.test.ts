import './env';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, createStaff, registerCustomer, startTestServer, STRONG_PASSWORD, unique, type TestContext } from './helpers';
import { query } from '../db/pool';
import { passwordProblems } from '../../shared/passwordPolicy';

let ctx: TestContext;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.close(); });

describe('registration', () => {
  it('creates a user and a linked customer record, with no invented loans', async () => {
    const { token, profile } = await registerCustomer(ctx);
    assert.equal(profile.role, 'customer');
    assert.ok(profile.customer?.id, 'customer profile is linked');
    assert.equal(profile.customer.membership, null);

    const counts = await query(
      `SELECT (SELECT count(*) FROM loan_applications WHERE customer_id = $1)::int AS apps,
              (SELECT count(*) FROM businesses)::int AS businesses`,
      [profile.customer.id],
    );
    assert.equal(counts.rows[0].apps, 0);
    assert.equal(counts.rows[0].businesses, 0);

    const me = await api(ctx, '/api/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.body.email, profile.email);
    assert.equal(me.body.passwordHash, undefined);
  });

  it('rejects weak passwords with field-level reasons', async () => {
    const response = await api(ctx, '/api/auth/register', {
      body: {
        fullName: 'Weak Password', email: `${unique()}@example.test`, phone: '+265999000111', nationalId: unique('N'),
        password: 'short', securityQuestion: 'Favourite colour?', securityAnswer: 'blue',
      },
    });
    assert.equal(response.status, 400);
    assert.ok(response.body.details.some((detail: any) => detail.field === 'password'));
  });

  it('applies the same password rules the web app shows (shared/passwordPolicy)', async () => {
    const base = { fullName: 'Rules Check', phone: '+265999000444', securityQuestion: 'First school?', securityAnswer: 'x1' };
    const tag = unique('kondwani');
    const cases = [
      { password: 'Password123', email: `${unique()}@example.test`, expected: /too common/ },
      { password: `${tag}9`, email: `${tag}@example.test`, expected: /email/ },
    ];
    for (const { password, email, expected } of cases) {
      const response = await api(ctx, '/api/auth/register', { body: { ...base, email, nationalId: unique('N'), password } });
      assert.equal(response.status, 400, `${password} should be rejected`);
      assert.ok(response.body.details.some((detail: any) => detail.field === 'password' && expected.test(detail.message)), JSON.stringify(response.body));
      assert.ok(passwordProblems(password, { email }).some(message => expected.test(message)), 'the browser check agrees');
    }
    // A password that passes the shared rules is accepted by the server.
    const ok = await api(ctx, '/api/auth/register', { body: { ...base, email: `${unique()}@example.test`, nationalId: unique('N'), password: 'Harvest2026season' } });
    assert.equal(ok.status, 201);
  });

  it('rejects duplicate email and duplicate national ID', async () => {
    const first = await registerCustomer(ctx);
    const dupEmail = await api(ctx, '/api/auth/register', {
      body: {
        fullName: 'Someone Else', email: first.email, phone: '+265999000222', nationalId: unique('N'),
        password: STRONG_PASSWORD, securityQuestion: 'First school?', securityAnswer: 'x1',
      },
    });
    assert.equal(dupEmail.status, 409);
    assert.equal(dupEmail.body.details[0].field, 'email', 'the conflict points at the email field');

    const nationalId = first.profile.customer.nationalId;
    const dupId = await api(ctx, '/api/auth/register', {
      body: {
        fullName: 'Someone Else', email: `${unique()}@example.test`, phone: '+265999000333', nationalId,
        password: STRONG_PASSWORD, securityQuestion: 'First school?', securityAnswer: 'x1',
      },
    });
    assert.equal(dupId.status, 409);
    assert.equal(dupId.body.details[0].field, 'nationalId');
  });
});

describe('login and sessions', () => {
  it('signs in, and logout revokes the token server-side', async () => {
    const { email, password } = await registerCustomer(ctx);
    const login = await api(ctx, '/api/auth/login', { body: { email, password } });
    assert.equal(login.status, 200);
    const token = login.body.token;
    assert.equal((await api(ctx, '/api/auth/me', { token })).status, 200);

    assert.equal((await api(ctx, '/api/auth/logout', { method: 'POST', token })).status, 204);
    assert.equal((await api(ctx, '/api/auth/me', { token })).status, 401);
  });

  it('gives the same error for unknown email and wrong password', async () => {
    const { email } = await registerCustomer(ctx);
    const wrong = await api(ctx, '/api/auth/login', { body: { email, password: 'Wrongpass123' } });
    const unknown = await api(ctx, '/api/auth/login', { body: { email: `${unique()}@nobody.test`, password: 'Wrongpass123' } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error, unknown.body.error);
  });

  it('locks the account after repeated failures', async () => {
    const { email } = await registerCustomer(ctx);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await api(ctx, '/api/auth/login', { body: { email, password: 'Wrongpass123' } });
    }
    const locked = await api(ctx, '/api/auth/login', { body: { email, password: STRONG_PASSWORD } });
    assert.equal(locked.status, 401);
    assert.match(locked.body.error, /locked/i);
  });

  it('rejects tampered and query-string tokens', async () => {
    const { token } = await registerCustomer(ctx);
    const tampered = token.slice(0, -2) + (token.endsWith('A') ? 'BB' : 'AA');
    assert.equal((await api(ctx, '/api/auth/me', { token: tampered })).status, 401);
    assert.equal((await api(ctx, `/api/auth/me?token=${encodeURIComponent(token)}`)).status, 401);
  });

  it('a deactivated user is signed out immediately', async () => {
    const staff = await createStaff(ctx, 'loan_officer');
    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [staff.id]);
    assert.equal((await api(ctx, '/api/auth/me', { token: staff.token })).status, 401);
  });
});

describe('password change', () => {
  it('requires the current password, enforces strength, and signs out other sessions', async () => {
    const { email, password, token } = await registerCustomer(ctx);
    const second = await api(ctx, '/api/auth/login', { body: { email, password } });
    const otherDevice = second.body.token;

    const wrongCurrent = await api(ctx, '/api/auth/change-password', { token, body: { currentPassword: 'Nottheone123', newPassword: 'Brandnew2027pass' } });
    assert.equal(wrongCurrent.status, 400);

    const weak = await api(ctx, '/api/auth/change-password', { token, body: { currentPassword: password, newPassword: 'abc' } });
    assert.equal(weak.status, 400);

    const changed = await api(ctx, '/api/auth/change-password', { token, body: { currentPassword: password, newPassword: 'Brandnew2027pass' } });
    assert.equal(changed.status, 200);
    assert.ok(changed.body.token, 'a fresh token is issued for this device');

    assert.equal((await api(ctx, '/api/auth/me', { token: otherDevice })).status, 401, 'other device signed out');
    assert.equal((await api(ctx, '/api/auth/me', { token })).status, 401, 'old token invalid');
    assert.equal((await api(ctx, '/api/auth/me', { token: changed.body.token })).status, 200, 'new token works');

    assert.equal((await api(ctx, '/api/auth/login', { body: { email, password } })).status, 401);
    assert.equal((await api(ctx, '/api/auth/login', { body: { email, password: 'Brandnew2027pass' } })).status, 200);
  });
});

describe('password reset', () => {
  it('resets with the security answer and revokes sessions', async () => {
    const { email, token } = await registerCustomer(ctx);
    const question = await api(ctx, '/api/auth/forgot-password/question', { body: { email } });
    assert.equal(question.status, 200);
    const verify = await api(ctx, '/api/auth/forgot-password/verify', { body: { email, answer: '  CHILOMONI ' } });
    assert.equal(verify.status, 200);
    const reset = await api(ctx, '/api/auth/forgot-password/reset', { body: { resetToken: verify.body.resetToken, newPassword: 'Recovered2027pass' } });
    assert.equal(reset.status, 200);
    assert.equal((await api(ctx, '/api/auth/me', { token })).status, 401);
    const reused = await api(ctx, '/api/auth/forgot-password/reset', { body: { resetToken: verify.body.resetToken, newPassword: 'Another2027pass' } });
    assert.equal(reused.status, 400, 'reset tokens are single-use');
  });
});

describe('audit trail', () => {
  it('records who did what, from the session rather than headers, and cannot be edited', async () => {
    const { token, profile } = await registerCustomer(ctx);
    await api(ctx, '/api/auth/me', { method: 'PATCH', token, body: { address: 'Area 47, Lilongwe' }, headers: { 'X-Actor-Id': 'someone-else' } });
    const rows = await query(`SELECT actor_id FROM audit_logs WHERE action = 'account.profile_update' ORDER BY occurred_at DESC LIMIT 1`);
    assert.equal(rows.rows[0].actor_id, profile.id);
    await assert.rejects(query('UPDATE audit_logs SET summary = $1', ['tampered']), /append-only/);
  });
});
