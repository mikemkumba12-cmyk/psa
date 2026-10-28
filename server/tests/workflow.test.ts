import './env';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, createStaff, fileForm, registerCustomer, SAMPLE_PDF, SAMPLE_PNG, startTestServer, unique, type TestContext } from './helpers';
import { one } from '../db/pool';

let ctx: TestContext;
let admin: Awaited<ReturnType<typeof createStaff>>;
before(async () => {
  ctx = await startTestServer();
  admin = await createStaff(ctx, 'admin');
});
after(async () => { await ctx.close(); });

const today = () => new Date().toISOString().slice(0, 10);

async function activateProduct(id: string, overrides: Record<string, unknown> = {}) {
  const response = await api(ctx, `/api/products/${id}`, {
    method: 'PATCH', token: admin.token,
    body: { interestRateMonthly: 4, termsConfirmed: true, status: 'active', fees: [{ name: 'Arrangement fee', type: 'percent', value: 2, deductedFromDisbursement: true }], ...overrides },
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

async function upload(token: string, fields: Record<string, string>, file = SAMPLE_PDF, name = 'doc.pdf', mime = 'application/pdf') {
  const response = await api(ctx, '/api/documents', { token, form: fileForm(fields, file, name, mime) });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body;
}

async function verifyDoc(token: string, id: string) {
  const response = await api(ctx, `/api/documents/${id}/review`, { token, body: { decision: 'verified' } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
}

describe('loan products', () => {
  it('seeded catalogue products are drafts and cannot be activated without a rate and confirmed terms', async () => {
    const list = await api(ctx, '/api/products', { token: admin.token });
    const working = list.body.find((product: any) => product.code === 'WORKING_CAPITAL');
    assert.equal(working.status, 'draft');
    assert.ok(working.activationBlockers.length >= 2);

    const premature = await api(ctx, `/api/products/${working.id}`, { method: 'PATCH', token: admin.token, body: { status: 'active' } });
    assert.equal(premature.status, 422);

    const customer = await registerCustomer(ctx);
    const visible = await api(ctx, '/api/products', { token: customer.token });
    assert.equal(visible.body.length, 0, 'customers see only available products');
  });

  it('only staff with products.manage can change products, and changes are audited', async () => {
    const officer = await createStaff(ctx, 'loan_officer');
    const denied = await api(ctx, '/api/products/prd_payroll', { method: 'PATCH', token: officer.token, body: { interestRateMonthly: 1 } });
    assert.equal(denied.status, 403);
    await activateProduct('prd_payroll');
    const audited = await one(`SELECT count(*)::int AS n FROM audit_logs WHERE entity_id = 'prd_payroll' AND action = 'product.activate'`);
    assert.equal(audited.n, 1);
  });

  it('quotes use the configured terms and reject out-of-range requests', async () => {
    const customer = await registerCustomer(ctx);
    const ok = await api(ctx, '/api/products/prd_payroll/quote', { token: customer.token, body: { amount: 500000, termMonths: 12 } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.schedule.length, 12);
    const tooBig = await api(ctx, '/api/products/prd_payroll/quote', { token: customer.token, body: { amount: 50_000_000, termMonths: 12 } });
    assert.equal(tooBig.status, 400);
  });
});

describe('staff permissions administration', () => {
  it('grants and revokes take effect immediately, and are audited', async () => {
    const officer = await createStaff(ctx, 'loan_officer');
    assert.equal((await api(ctx, '/api/members', { token: officer.token })).status, 200, 'officers can view members by default');

    const revoke = await api(ctx, `/api/admin/staff/${officer.id}/access`, { method: 'PUT', token: admin.token, body: { grants: [], denies: ['members.view'], productIds: [], approvalLimit: null } });
    assert.equal(revoke.status, 200);
    assert.ok(!revoke.body.effectivePermissions.includes('members.view'));
    assert.equal((await api(ctx, '/api/members', { token: officer.token })).status, 403, 'same token, new permissions');

    const audited = await one(`SELECT metadata FROM audit_logs WHERE action = 'permissions.update' AND entity_id = $1`, [officer.id]);
    assert.deepEqual(audited.metadata.denies.added, ['members.view']);
  });

  it('prevents self-escalation and protects the last administrator', async () => {
    const manager = await createStaff(ctx, 'manager', { grant: ['permissions.manage', 'staff.manage'] });
    const self = await api(ctx, `/api/admin/staff/${manager.id}/access`, { method: 'PUT', token: manager.token, body: { grants: ['products.manage'], denies: [], productIds: [], approvalLimit: 1e9 } });
    assert.equal(self.status, 403);

    const officer = await createStaff(ctx, 'loan_officer');
    const escalate = await api(ctx, `/api/admin/staff/${officer.id}/access`, { method: 'PUT', token: manager.token, body: { grants: ['products.manage'], denies: [], productIds: [], approvalLimit: null } });
    assert.equal(escalate.status, 403, 'cannot grant a permission you do not hold');

    const selfDeactivate = await api(ctx, `/api/admin/staff/${admin.id}`, { method: 'PATCH', token: admin.token, body: { isActive: false } });
    assert.equal(selfDeactivate.status, 403);
  });

  it('new staff get a temporary password they must change before working', async () => {
    const created = await api(ctx, '/api/admin/staff', { token: admin.token, body: { fullName: 'New Officer', email: `${unique()}@staff.test`, role: 'loan_officer' } });
    assert.equal(created.status, 201);
    const login = await api(ctx, '/api/auth/login', { body: { email: created.body.staff.email, password: created.body.temporaryPassword } });
    assert.equal(login.status, 200);
    assert.equal(login.body.profile.mustChangePassword, true);
    assert.equal((await api(ctx, '/api/customers', { token: login.body.token })).status, 403);
    const changed = await api(ctx, '/api/auth/change-password', { token: login.body.token, body: { currentPassword: created.body.temporaryPassword, newPassword: 'Officer2027secure' } });
    assert.equal(changed.status, 200);
    assert.equal((await api(ctx, '/api/customers', { token: changed.body.token })).status, 200);
  });
});

describe('SME lending end to end', () => {
  it('runs from business profile to repayment with membership, documents, approval limits and maker-checker', async () => {
    await activateProduct('prd_working_capital');
    const manager = await createStaff(ctx, 'manager', { approvalLimit: 50_000_000 });
    const smallLimitManager = await createStaff(ctx, 'manager', { approvalLimit: 1_000_000 });
    const officer = await createStaff(ctx, 'loan_officer', { products: ['prd_working_capital'] });
    const otherOfficer = await createStaff(ctx, 'loan_officer', { products: ['prd_payroll'] });
    const owner = await registerCustomer(ctx, { segment: 'sme' });
    const ownerCustomerId = owner.profile.customer.id;

    // Business profile created by the owner.
    const business = await api(ctx, '/api/businesses', {
      token: owner.token,
      body: { registeredName: `Chikondi Traders ${unique()}`, legalStructure: 'private_limited', registrationNumber: unique('REG'), tpin: unique('TP'), sector: 'Retail', district: 'Lilongwe', dateEstablished: '2021-03-01', myRole: 'owner', ownershipPct: 100 },
    });
    assert.equal(business.status, 201, JSON.stringify(business.body));
    const businessId = business.body.id;

    // Another customer cannot see it.
    const stranger = await registerCustomer(ctx);
    assert.equal((await api(ctx, `/api/businesses/${businessId}`, { token: stranger.token })).status, 404);

    await api(ctx, `/api/businesses/${businessId}/financials`, {
      token: owner.token,
      body: { periodStart: '2026-01-01', periodEnd: '2026-06-30', avgMonthlyRevenue: 9_000_000, avgMonthlyCostOfSales: 4_500_000, avgMonthlyOperatingExpenses: 1_500_000, existingMonthlyDebtService: 200_000, largestCustomerShare: 0.3 },
    });

    // Documents the product requires, plus the owner's ID.
    const registration = await upload(owner.token, { documentType: 'business_registration', businessId });
    const tax = await upload(owner.token, { documentType: 'tax_clearance', businessId });
    const statement = await upload(owner.token, { documentType: 'bank_statement', businessId });
    const ownerId = await upload(owner.token, { documentType: 'national_id_front' }, SAMPLE_PNG, 'id.png', 'image/png');

    // Draft application.
    const draft = await api(ctx, '/api/applications', {
      token: owner.token,
      body: { productId: 'prd_working_capital', businessId, amount: 5_000_000, termMonths: 6, purpose: 'Stock for the festive season' },
    });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    const appId = draft.body.id;
    assert.match(draft.body.reference, /^PFS-\d{4}-\d{6}$/);

    // Typing a member number does not make anyone eligible.
    const claim = await api(ctx, '/api/members/claim', { token: owner.token, body: { memberNumber: unique('M') } });
    assert.equal(claim.status, 201);
    const blocked = await api(ctx, `/api/applications/${appId}/submit`, { method: 'POST', token: owner.token });
    assert.equal(blocked.status, 422);
    assert.ok(blocked.body.details.some((detail: any) => detail.field === 'membership'), JSON.stringify(blocked.body));

    // Staff verify membership and the owner's link to the business.
    const memberRow = await one('SELECT id FROM members WHERE customer_id = $1', [ownerCustomerId]);
    const activated = await api(ctx, `/api/members/${memberRow.id}`, { method: 'PATCH', token: manager.token, body: { status: 'active', joinedOn: '2024-01-15', reason: 'Checked against the membership register' } });
    assert.equal(activated.status, 200, JSON.stringify(activated.body));
    const detail = await api(ctx, `/api/businesses/${businessId}`, { token: manager.token });
    const ownerParty = detail.body.parties.find((party: any) => party.customerId === ownerCustomerId);
    assert.equal((await api(ctx, `/api/businesses/${businessId}/parties/${ownerParty.id}/verify`, { token: manager.token, body: { verified: true } })).status, 200);

    const submitted = await api(ctx, `/api/applications/${appId}/submit`, { method: 'POST', token: owner.token });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.equal(submitted.body.status, 'submitted');

    // An officer without this product cannot see it; assignment to them is refused.
    assert.equal((await api(ctx, `/api/applications/${appId}`, { token: otherOfficer.token })).status, 404);
    assert.equal((await api(ctx, `/api/applications/${appId}/assign`, { token: manager.token, body: { officerId: otherOfficer.id } })).status, 422);
    const assigned = await api(ctx, `/api/applications/${appId}/assign`, { token: manager.token, body: { officerId: officer.id } });
    assert.equal(assigned.body.status, 'under_review');

    // Officer verifies documents and the business, records verified figures, assesses and recommends.
    for (const doc of [registration, tax, statement, ownerId]) await verifyDoc(officer.token, doc.id);
    assert.equal((await api(ctx, `/api/businesses/${businessId}/verify`, { token: officer.token, body: { decision: 'verified' } })).status, 403, 'officers lack businesses.verify by default');
    assert.equal((await api(ctx, `/api/businesses/${businessId}/verify`, { token: manager.token, body: { decision: 'verified' } })).status, 200);
    const verifiedFigures = await api(ctx, `/api/businesses/${businessId}/financials`, {
      token: manager.token,
      body: { periodStart: '2026-01-01', periodEnd: '2026-06-30', avgMonthlyRevenue: 8_200_000, avgMonthlyCostOfSales: 4_300_000, avgMonthlyOperatingExpenses: 1_600_000, existingMonthlyDebtService: 200_000, supportingDocumentId: statement.id },
    });
    assert.equal(verifiedFigures.status, 201, JSON.stringify(verifiedFigures.body));

    const assessed = await api(ctx, `/api/applications/${appId}/assess`, { token: officer.token, body: { officerSummary: 'Cash flow from verified bank statements covers the installment comfortably.' } });
    assert.equal(assessed.status, 201, JSON.stringify(assessed.body));
    assert.equal(assessed.body.assessment.inputs.avgMonthlyRevenue.source, 'verified');
    assert.equal(assessed.body.assessment.inputs.avgMonthlyRevenue.value, 8_200_000);
    assert.ok(assessed.body.assessment.results.debtServiceCoverage > 1);

    assert.equal((await api(ctx, `/api/applications/${appId}/approve`, { token: officer.token, body: { reason: 'Officer tries to approve directly' } })).status, 403);
    const recommended = await api(ctx, `/api/applications/${appId}/recommend`, { token: officer.token, body: { recommendation: 'approve', note: 'Recommend approval on verified cash flow.' } });
    assert.equal(recommended.body.status, 'recommended');

    // Approval limits.
    const overLimit = await api(ctx, `/api/applications/${appId}/approve`, { token: smallLimitManager.token, body: { reason: 'Within policy and verified cash flow.' } });
    assert.equal(overLimit.status, 403);
    assert.match(overLimit.body.error, /approval limit/);
    const approved = await api(ctx, `/api/applications/${appId}/approve`, { token: manager.token, body: { reason: 'Within policy and verified cash flow.' } });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.status, 'approved');

    // Offer and acceptance.
    const offered = await api(ctx, `/api/applications/${appId}/offer`, { token: officer.token, body: {} });
    assert.equal(offered.status, 201, JSON.stringify(offered.body));
    const offer = offered.body.offers[0];
    assert.equal(offer.totalFees, 100_000);
    assert.equal((await api(ctx, `/api/applications/${appId}/offer/respond`, { token: stranger.token, body: { accept: true } })).status, 404);
    const accepted = await api(ctx, `/api/applications/${appId}/offer/respond`, { token: owner.token, body: { accept: true } });
    assert.equal(accepted.body.status, 'offer_accepted');

    // Maker-checker disbursement.
    const wrongAmount = await api(ctx, `/api/applications/${appId}/transactions`, { token: officer.token, body: { type: 'disbursement', amount: 5_000_000, valueDate: today(), channel: 'bank_transfer', externalReference: unique('BANK') } });
    assert.equal(wrongAmount.status, 422, 'must equal net of deducted fees');
    const recorded = await api(ctx, `/api/applications/${appId}/transactions`, { token: officer.token, body: { type: 'disbursement', amount: 4_900_000, valueDate: today(), channel: 'bank_transfer', externalReference: unique('BANK') } });
    assert.equal(recorded.status, 201, JSON.stringify(recorded.body));
    const stillAccepted = await api(ctx, `/api/applications/${appId}`, { token: owner.token });
    assert.equal(stillAccepted.body.status, 'offer_accepted', 'not disbursed until confirmed');
    assert.equal((await api(ctx, `/api/transactions/${recorded.body.id}/confirm`, { method: 'POST', token: officer.token })).status, 403);
    assert.equal((await api(ctx, `/api/transactions/${recorded.body.id}/confirm`, { method: 'POST', token: manager.token })).status, 200);

    const disbursed = await api(ctx, `/api/applications/${appId}`, { token: owner.token });
    assert.equal(disbursed.body.status, 'disbursed');
    assert.equal(disbursed.body.schedule.length, 6);
    const totalDue = disbursed.body.position.outstandingTotal;

    // Partial then full repayment.
    const first = await api(ctx, `/api/applications/${appId}/transactions`, { token: officer.token, body: { type: 'repayment', amount: 1_000_000, valueDate: today(), channel: 'mobile_money', externalReference: unique('MM') } });
    await api(ctx, `/api/transactions/${first.body.id}/confirm`, { method: 'POST', token: manager.token });
    const afterFirst = await api(ctx, `/api/applications/${appId}`, { token: owner.token });
    assert.equal(afterFirst.body.position.paidTotal, 1_000_000);

    const tooMuch = await api(ctx, `/api/applications/${appId}/transactions`, { token: officer.token, body: { type: 'repayment', amount: totalDue, valueDate: today(), channel: 'bank_transfer', externalReference: unique('BANK') } });
    assert.equal(tooMuch.status, 422, 'cannot exceed the outstanding balance');
    const rest = await api(ctx, `/api/applications/${appId}/transactions`, { token: officer.token, body: { type: 'repayment', amount: Math.round((totalDue - 1_000_000) * 100) / 100, valueDate: today(), channel: 'bank_transfer', externalReference: unique('BANK') } });
    assert.equal(rest.status, 201, JSON.stringify(rest.body));
    await api(ctx, `/api/transactions/${rest.body.id}/confirm`, { method: 'POST', token: manager.token });
    const closed = await api(ctx, `/api/applications/${appId}`, { token: owner.token });
    assert.equal(closed.body.status, 'closed');

    const events = closed.body.timeline.map((event: any) => event.to);
    for (const status of ['draft', 'submitted', 'under_review', 'assessed', 'recommended', 'approved', 'offer_issued', 'offer_accepted', 'disbursed', 'closed']) {
      assert.ok(events.includes(status), `timeline includes ${status}`);
    }
  });

  it('a representative needs a verified authorisation before applying', async () => {
    const owner = await registerCustomer(ctx);
    const rep = await registerCustomer(ctx);
    const business = await api(ctx, '/api/businesses', {
      token: owner.token,
      body: { registeredName: `Rep Test ${unique()}`, legalStructure: 'sole_proprietorship', sector: 'Agriculture', district: 'Zomba', myRole: 'owner' },
    });
    const repNationalId = rep.profile.customer.nationalId;
    const link = await api(ctx, `/api/businesses/${business.body.id}/parties`, { token: owner.token, body: { nationalId: repNationalId, fullName: 'Representative', role: 'representative' } });
    assert.equal(link.status, 201);
    const eligibility = await api(ctx, `/api/businesses/${business.body.id}/eligibility`, { token: rep.token });
    assert.equal(eligibility.body.eligible, false);
    assert.ok(eligibility.body.reasons.some((reason: string) => /authori[sz]ation/i.test(reason)));
  });
});

describe('individual lending', () => {
  it('payroll application needs income and documents; officers see only their products', async () => {
    const customer = await registerCustomer(ctx);
    const draft = await api(ctx, '/api/applications', { token: customer.token, body: { productId: 'prd_payroll', amount: 400_000, termMonths: 12, purpose: 'School fees for my children', declared: {} } });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    const incomplete = await api(ctx, `/api/applications/${draft.body.id}/submit`, { method: 'POST', token: customer.token });
    assert.equal(incomplete.status, 422);
    const fields = incomplete.body.details.map((detail: any) => detail.field);
    assert.ok(fields.includes('declared.monthlyNetIncome'));
    assert.ok(fields.includes('documents.payslip'));

    await api(ctx, `/api/applications/${draft.body.id}`, { method: 'PATCH', token: customer.token, body: { declared: { monthlyNetIncome: 350_000, existingMonthlyDeductions: 40_000 } } });
    await upload(customer.token, { documentType: 'national_id_front' }, SAMPLE_PNG, 'f.png', 'image/png');
    await upload(customer.token, { documentType: 'national_id_back' }, SAMPLE_PNG, 'b.png', 'image/png');
    await upload(customer.token, { documentType: 'payslip', applicationId: draft.body.id });
    const submitted = await api(ctx, `/api/applications/${draft.body.id}/submit`, { method: 'POST', token: customer.token });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));

    const smeOfficer = await createStaff(ctx, 'loan_officer', { products: ['prd_working_capital'] });
    const visible = await api(ctx, '/api/applications', { token: smeOfficer.token });
    assert.ok(!visible.body.items.some((item: any) => item.id === draft.body.id));
    assert.equal((await api(ctx, `/api/applications/${draft.body.id}`, { token: smeOfficer.token })).status, 404);

    // Applicants cannot read another applicant's application.
    const other = await registerCustomer(ctx);
    assert.equal((await api(ctx, `/api/applications/${draft.body.id}`, { token: other.token })).status, 404);
  });

  it('assessment flags a debt service ratio above the threshold without deciding', async () => {
    const customer = await registerCustomer(ctx);
    const draft = await api(ctx, '/api/applications', { token: customer.token, body: { productId: 'prd_payroll', amount: 3_000_000, termMonths: 12, purpose: 'Building materials for my house', declared: { monthlyNetIncome: 300_000, existingMonthlyDeductions: 50_000 } } });
    await upload(customer.token, { documentType: 'national_id_front' }, SAMPLE_PNG, 'f.png', 'image/png');
    await upload(customer.token, { documentType: 'national_id_back' }, SAMPLE_PNG, 'b.png', 'image/png');
    await upload(customer.token, { documentType: 'payslip', applicationId: draft.body.id });
    await api(ctx, `/api/applications/${draft.body.id}/submit`, { method: 'POST', token: customer.token });
    const officer = await createStaff(ctx, 'loan_officer', { products: ['prd_payroll'] });
    const manager = await createStaff(ctx, 'manager');
    await api(ctx, `/api/applications/${draft.body.id}/assign`, { token: manager.token, body: { officerId: officer.id } });
    const assessed = await api(ctx, `/api/applications/${draft.body.id}/assess`, { token: officer.token, body: { officerSummary: 'Declared income only; ratio is high.' } });
    assert.equal(assessed.status, 201, JSON.stringify(assessed.body));
    const codes = assessed.body.assessment.indicators.map((item: any) => item.code);
    assert.ok(codes.includes('dsr_above_threshold'));
    assert.equal(assessed.body.application.status, 'assessed', 'the system does not reject on its own');
    assert.equal(assessed.body.assessment.inputs.monthlyNetIncome.source, 'applicant');
  });
});
