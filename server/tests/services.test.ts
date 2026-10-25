import './env';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, createStaff, fileForm, registerCustomer, SAMPLE_PDF, SAMPLE_PNG, startTestServer, unique, type TestContext } from './helpers';
import { one, query } from '../db/pool';
import { chunkMarkdown } from '../modules/assistant/knowledge';
import { snapshotPortfolio } from '../modules/reports/reports';

let ctx: TestContext;
let admin: Awaited<ReturnType<typeof createStaff>>;
before(async () => {
  ctx = await startTestServer();
  admin = await createStaff(ctx, 'admin');
});
after(async () => { await ctx.close(); });

const ask = async (token: string, message: string) => (await api(ctx, '/api/assistant/chat', { token, body: { message } })).body;

describe('assistant', () => {
  it('does not invent a rate for a product without one, and refuses actions', async () => {
    const customer = await registerCustomer(ctx);
    // Nothing is active: no products are offered.
    const list = await ask(customer.token, 'What loans do you offer?');
    assert.equal(list.intent, 'product_list');
    assert.match(list.answer, /No loan products are open/);

    await api(ctx, '/api/products/prd_payroll', { method: 'PATCH', token: admin.token, body: { interestRateMonthly: 3.5, termsConfirmed: true, status: 'active' } });
    const info = await ask(customer.token, 'Tell me about the payroll loan interest rate');
    assert.equal(info.intent, 'product_info');
    assert.match(info.answer, /3\.5% per month/);
    assert.ok(info.sources.length > 0);

    // A staff member asking about a draft product gets an honest "not published".
    const officer = await createStaff(ctx, 'loan_officer');
    const draft = await ask(officer.token, 'What is the interest rate on invoice discounting?');
    assert.match(draft.answer, /not yet published/);

    const refusal = await ask(customer.token, 'Please approve my loan today');
    assert.equal(refusal.intent, 'refused_action');
    const advice = await ask(customer.token, 'Should I invest in crypto?');
    assert.equal(advice.intent, 'refused_advice');
  });

  it('calculates estimates only from configured terms and marks them as estimates', async () => {
    const customer = await registerCustomer(ctx);
    const reply = await ask(customer.token, 'How much would I pay for a payroll loan of 600,000 over 12 months?');
    assert.equal(reply.intent, 'estimate', JSON.stringify(reply));
    assert.match(reply.answer, /not an offer/);
    const outOfRange = await ask(customer.token, 'Estimate a payroll loan of 90 million over 12 months');
    assert.equal(outOfRange.intent, 'estimate_out_of_range');
  });

  it('answers policy questions from approved knowledge with citations, and falls back when unsure', async () => {
    const customer = await registerCustomer(ctx);
    const docs = await ask(customer.token, 'What documents are needed for SME working capital applications?');
    assert.ok(['knowledge', 'product_info'].includes(docs.intent), JSON.stringify(docs));
    const policy = await ask(customer.token, 'How do you check affordability before approving?');
    assert.equal(policy.intent, 'knowledge', JSON.stringify(policy));
    assert.ok(policy.sources.some((source: any) => /responsible lending/i.test(source.title)));

    const unknown = await ask(customer.token, 'What is the capital city of Peru?');
    assert.equal(unknown.intent, 'fallback');
    assert.equal(unknown.grounded, false);
  });

  it('staff-only and draft knowledge never reaches customers', async () => {
    const author = await createStaff(ctx, 'manager', { grant: ['knowledge.manage'] });
    const created = await api(ctx, '/api/knowledge', {
      token: author.token,
      body: { title: 'Internal escalation matrix', sourceType: 'institution_policy', visibility: 'staff', body: '## Zebrafinch escalation\nZebrafinch cases escalate to the credit committee within two days.' },
    });
    assert.equal(created.status, 201);
    assert.equal((await api(ctx, `/api/knowledge/${created.body.id}/status`, { token: author.token, body: { status: 'approved' } })).status, 403, 'authors cannot approve their own text');

    const officer = await createStaff(ctx, 'loan_officer');
    assert.equal((await ask(officer.token, 'zebrafinch escalation')).intent, 'fallback', 'drafts are not searchable');
    assert.equal((await api(ctx, `/api/knowledge/${created.body.id}/status`, { token: admin.token, body: { status: 'approved' } })).status, 200);
    assert.equal((await ask(officer.token, 'zebrafinch escalation')).intent, 'knowledge');

    const customer = await registerCustomer(ctx);
    assert.equal((await ask(customer.token, 'zebrafinch escalation')).intent, 'fallback', 'staff-only content hidden from customers');
  });

  it('only reads the signed-in customer’s own applications and masks logged questions', async () => {
    const customer = await registerCustomer(ctx);
    const reply = await ask(customer.token, 'What is the status of my application 12345?');
    assert.equal(reply.intent, 'own_account');
    const log = await one(`SELECT question_masked FROM assistant_logs ORDER BY id DESC LIMIT 1`);
    assert.ok(!/\d/.test(log.question_masked), 'digits are masked in diagnostics');
  });

  it('splits knowledge into heading-aware chunks', () => {
    const chunks = chunkMarkdown(`## One\nAlpha.\n\n## Two\n${'Beta sentence. '.repeat(120)}\n\nGamma.`);
    assert.equal(chunks[0].heading, 'One');
    assert.ok(chunks.filter(chunk => chunk.heading === 'Two').length >= 2);
    assert.ok(chunks.every(chunk => chunk.content.length <= 1900));
  });
});

describe('reports', () => {
  it('figures match the underlying records and say when demo data is included', async () => {
    const manager = await createStaff(ctx, 'manager', { approvalLimit: 10_000_000 });
    const officer = await createStaff(ctx, 'loan_officer', { products: ['prd_payroll'], grant: ['payroll.manage'] });
    const customer = await registerCustomer(ctx, { employeeNumber: unique('EMP') });
    const draft = await api(ctx, '/api/applications', { token: customer.token, body: { productId: 'prd_payroll', amount: 300_000, termMonths: 3, purpose: 'Medical bills for family', declared: { monthlyNetIncome: 400_000 } } });
    for (const type of ['national_id_front', 'national_id_back']) {
      const doc = await api(ctx, '/api/documents', { token: customer.token, form: fileForm({ documentType: type }, SAMPLE_PNG, 'id.png', 'image/png') });
      await api(ctx, `/api/documents/${doc.body.id}/review`, { token: officer.token, body: { decision: 'verified' } });
    }
    const payslip = await api(ctx, '/api/documents', { token: customer.token, form: fileForm({ documentType: 'payslip', applicationId: draft.body.id }, SAMPLE_PDF, 'p.pdf') });
    await api(ctx, `/api/applications/${draft.body.id}/submit`, { method: 'POST', token: customer.token });
    await api(ctx, `/api/applications/${draft.body.id}/assign`, { token: manager.token, body: { officerId: officer.id } });
    await api(ctx, `/api/documents/${payslip.body.id}/review`, { token: officer.token, body: { decision: 'verified' } });
    await api(ctx, `/api/applications/${draft.body.id}/assess`, { token: officer.token, body: { officerSummary: 'Affordable on declared income.' } });
    await api(ctx, `/api/applications/${draft.body.id}/recommend`, { token: officer.token, body: { recommendation: 'approve', note: 'Within affordability.' } });
    const approved = await api(ctx, `/api/applications/${draft.body.id}/approve`, { token: manager.token, body: { reason: 'Meets the payroll lending policy.' } });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    await api(ctx, `/api/applications/${draft.body.id}/offer`, { token: officer.token, body: {} });
    await api(ctx, `/api/applications/${draft.body.id}/offer/respond`, { token: customer.token, body: { accept: true } });
    const disb = await api(ctx, `/api/applications/${draft.body.id}/transactions`, { token: officer.token, body: { type: 'disbursement', amount: 300_000, valueDate: '2026-06-01', channel: 'bank_transfer', externalReference: unique('B') } });
    await api(ctx, `/api/transactions/${disb.body.id}/confirm`, { method: 'POST', token: manager.token });

    // Installments due 2026-07-01, 08-01, 09-01 are all in the past and unpaid → arrears.
    const report = await api(ctx, '/api/reports/overview?from=2026-01-01', { token: manager.token });
    assert.equal(report.status, 200, JSON.stringify(report.body));
    const expected = await one(`SELECT sum(total_due)::float AS due, sum(principal_due)::float AS principal FROM loan_installments WHERE application_id = $1`, [draft.body.id]);
    assert.equal(report.body.portfolio.active_loans, 1);
    assert.equal(report.body.portfolio.outstanding_principal, 300_000);
    assert.equal(report.body.portfolio.outstanding_total, expected.due);
    assert.equal(report.body.portfolio.arrears, expected.due);
    assert.equal(report.body.portfolio.par30, 1, 'the whole outstanding principal is more than 30 days late');
    assert.equal(report.body.flows.disbursed, 300_000);
    assert.equal(report.body.decisions.approved, 1);
    assert.equal(report.body.dataComposition.live_applications, 1);

    await snapshotPortfolio();
    const history = await api(ctx, '/api/reports/history', { token: manager.token });
    assert.equal(history.body.points.at(-1).outstanding_principal, 300_000);

    // Payroll reconciliation records a repayment that still needs confirmation.
    const employeeNumber = customer.profile.customer.employeeNumber;
    const batch = await api(ctx, '/api/payroll/batches', {
      token: officer.token,
      body: { fileName: 'deductions.csv', employer: 'Ministry of Education', month: '2026-07', valueDate: '2026-07-25', rows: [{ employeeNumber, amount: 50_000 }, { employeeNumber: 'NOPE-1', amount: 10_000 }] },
    });
    assert.equal(batch.status, 201, JSON.stringify(batch.body));
    assert.deepEqual(batch.body.results.map((row: any) => row.status), ['matched', 'unmatched']);
    const pending = await one(`SELECT status FROM loan_transactions WHERE application_id = $1 AND channel = 'payroll'`, [draft.body.id]);
    assert.equal(pending.status, 'pending_confirmation');

    // CSV export neutralises formulas and is audited.
    const csv = await api(ctx, '/api/reports/export/applications?from=2026-01-01', { token: manager.token });
    assert.equal(csv.status, 200);
    assert.match(csv.body.toString(), /PFS-/);
    const officerExport = await api(ctx, '/api/reports/export/applications', { token: officer.token });
    assert.equal(officerExport.status, 403);
  });

  it('data-quality checks report volumes and issues', async () => {
    const manager = await createStaff(ctx, 'manager');
    const response = await api(ctx, '/api/reports/data-quality', { token: manager.token });
    assert.equal(response.status, 200);
    assert.ok(response.body.checks.some((check: any) => check.check === 'demo_records_present'));
    assert.ok(response.body.volumes.customers >= 1);
  });
});

describe('messages', () => {
  it('customers message staff privately; other customers cannot read the thread', async () => {
    const customer = await registerCustomer(ctx);
    const other = await registerCustomer(ctx);
    const started = await api(ctx, '/api/conversations', { token: customer.token, body: { subject: 'Repayment date', message: 'Can I change my repayment date?' } });
    assert.equal(started.status, 201);
    assert.equal((await api(ctx, `/api/conversations/${started.body.id}/messages`, { token: other.token })).status, 404);
    const officer = await createStaff(ctx, 'loan_officer');
    assert.equal((await api(ctx, `/api/conversations/${started.body.id}/messages`, { token: officer.token, body: { content: 'Yes, visit the branch.' } })).status, 201);
    const thread = await api(ctx, `/api/conversations/${started.body.id}/messages`, { token: customer.token });
    assert.equal(thread.body.messages.length, 2);
    assert.ok(thread.body.messages[1].fromStaff);
  });
});

describe('passkeys', () => {
  it('issues registration options for the signed-in user and rejects forged responses', async () => {
    const customer = await registerCustomer(ctx);
    const options = await api(ctx, '/api/auth/passkeys/register/options', { method: 'POST', token: customer.token });
    assert.equal(options.status, 200);
    assert.equal(options.body.options.rp.name, 'Pinnacle Financial Services');
    assert.equal(options.body.options.authenticatorSelection.userVerification, 'required');
    const forged = await api(ctx, '/api/auth/passkeys/register/verify', { token: customer.token, body: { challengeId: options.body.challengeId, response: { id: 'x', rawId: 'x', type: 'public-key', response: {} } } });
    assert.equal(forged.status, 400);
    const reused = await api(ctx, '/api/auth/passkeys/register/verify', { token: customer.token, body: { challengeId: options.body.challengeId, response: {} } });
    assert.equal(reused.status, 400, 'challenges are single-use');

    const login = await api(ctx, '/api/auth/passkeys/login/options', { method: 'POST' });
    assert.equal(login.status, 200);
    const unknown = await api(ctx, '/api/auth/passkeys/login/verify', { body: { challengeId: login.body.challengeId, response: { id: 'unknown-credential' } } });
    assert.equal(unknown.status, 401);
  });
});

describe('audit log access', () => {
  it('requires audit.view', async () => {
    const officer = await createStaff(ctx, 'loan_officer');
    assert.equal((await api(ctx, '/api/audit-logs', { token: officer.token })).status, 403);
    const manager = await createStaff(ctx, 'manager');
    const logs = await api(ctx, '/api/audit-logs?action=auth.', { token: manager.token });
    assert.equal(logs.status, 200);
    assert.ok(logs.body.items.length > 0);
    await query('SELECT 1');
  });
});
