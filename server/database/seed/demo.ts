/**
 * Demo data for local development and demonstrations.
 *
 *   npm run seed:demo
 *
 * The data is created through the real API (so it obeys every validation and
 * permission rule) and then marked data_source = 'demo'. Dashboards and reports
 * label demo data and can exclude it. Demo products are separate from the
 * institution's catalogue and use ILLUSTRATIVE terms that are not Pinnacle's.
 *
 * Passwords are generated randomly and written to .local/demo-credentials.txt.
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { AddressInfo } from 'net';
import { config } from '../../config';
import { pool, query, one } from '../../db/pool';
import { createApp } from '../../app';
import { hashSecret } from '../../auth/passwords';
import { newId } from '../../lib/ids';
import { pendingMigrations } from '../migrate';

if (config.isProduction) {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

const created: Record<string, string[]> = { users: [], customers: [], businesses: [], members: [], applications: [], products: [], transactions: [] };
const password = () => `Demo-${crypto.randomBytes(6).toString('base64url')}7a`;

async function main() {
  if ((await pendingMigrations()).length) throw new Error('Run "npm run migrate" first.');
  const existing = await one(`SELECT count(*)::int AS n FROM users WHERE data_source = 'demo'`);
  if (existing.n > 0) {
    console.log('Demo data already present. Nothing to do.');
    return;
  }

  const server = await new Promise<any>(resolve => { const s = createApp().listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (pathName: string, options: { token?: string; body?: unknown; method?: string; form?: FormData } = {}) => {
    const headers: Record<string, string> = {};
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    let body: any;
    if (options.form) body = options.form;
    else if (options.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(options.body); }
    const response = await fetch(`${base}${pathName}`, { method: options.method || (body ? 'POST' : 'GET'), headers, body });
    const data = response.headers.get('content-type')?.includes('json') ? await response.json() : null;
    if (!response.ok) throw new Error(`${options.method || 'POST'} ${pathName} → ${response.status}: ${JSON.stringify(data)}`);
    return data;
  };
  const credentials: string[] = [];

  try {
    // ── Staff ────────────────────────────────────────────────────────────────
    const staffSpecs = [
      { role: 'admin', name: 'Demo Administrator', email: 'admin@demo.pinnacle.test', title: 'System Administrator', limit: null },
      { role: 'manager', name: 'Demo Credit Manager', email: 'manager@demo.pinnacle.test', title: 'Credit Manager', limit: 20_000_000 },
      { role: 'loan_officer', name: 'Demo SME Officer', email: 'sme.officer@demo.pinnacle.test', title: 'SME Loan Officer', limit: null },
      { role: 'loan_officer', name: 'Demo Payroll Officer', email: 'payroll.officer@demo.pinnacle.test', title: 'Payroll Loan Officer', limit: null },
      { role: 'executive', name: 'Demo Executive', email: 'executive@demo.pinnacle.test', title: 'Executive', limit: null },
    ];
    const staff: Record<string, { id: string; token: string }> = {};
    for (const spec of staffSpecs) {
      const id = newId('usr');
      const pass = password();
      await query(
        `INSERT INTO users (id, email, password_hash, name, role, staff_title, approval_limit, data_source) VALUES ($1,$2,$3,$4,$5,$6,$7,'demo')`,
        [id, spec.email, await hashSecret(pass), spec.name, spec.role, spec.title, spec.limit],
      );
      created.users.push(id);
      const login = await call('/api/auth/login', { body: { email: spec.email, password: pass } });
      staff[spec.email] = { id, token: login.token };
      credentials.push(`${spec.title.padEnd(22)} ${spec.email.padEnd(38)} ${pass}`);
    }
    const adminToken = staff['admin@demo.pinnacle.test'].token;
    const manager = staff['manager@demo.pinnacle.test'];
    const smeOfficer = staff['sme.officer@demo.pinnacle.test'];
    const payrollOfficer = staff['payroll.officer@demo.pinnacle.test'];

    // ── Demo products (illustrative terms, clearly labelled) ────────────────
    const demoProducts = [
      { code: 'DEMO_PAYROLL', category: 'payroll', borrowerType: 'individual', name: '[Demo] Payroll Loan', rate: 4, method: 'reducing_balance', freq: 'monthly', min: 50_000, max: 5_000_000, minTerm: 3, maxTerm: 36, docs: ['national_id_front', 'national_id_back', 'payslip'], membersOnly: false },
      { code: 'DEMO_WORKING_CAPITAL', category: 'working_capital', borrowerType: 'business', name: '[Demo] Working Capital Loan', rate: 5, method: 'reducing_balance', freq: 'monthly', min: 3_000_000, max: 100_000_000, minTerm: 6, maxTerm: 12, docs: ['business_registration', 'tax_clearance', 'bank_statement'], membersOnly: true },
    ];
    const productIds: Record<string, string> = {};
    for (const spec of demoProducts) {
      const product = await call('/api/products', {
        token: adminToken,
        body: {
          code: spec.code, category: spec.category, borrowerType: spec.borrowerType, name: spec.name,
          description: 'DEMO PRODUCT with illustrative terms for testing only. These are not Pinnacle’s rates or fees.',
          minAmount: spec.min, maxAmount: spec.max, minTermMonths: spec.minTerm, maxTermMonths: spec.maxTerm,
          interestMethod: spec.method, interestRateMonthly: spec.rate, repaymentFrequency: spec.freq,
          fees: [{ name: 'Arrangement fee (demo)', type: 'percent', value: 2, deductedFromDisbursement: true }],
          requiredDocuments: spec.docs, membersOnly: spec.membersOnly, termsConfirmed: true,
        },
      });
      await call(`/api/products/${product.id}`, { method: 'PATCH', token: adminToken, body: { status: 'active' } });
      productIds[spec.code] = product.id;
      created.products.push(product.id);
    }
    await call(`/api/admin/staff/${smeOfficer.id}/access`, { method: 'PUT', token: adminToken, body: { grants: [], denies: [], productIds: [productIds.DEMO_WORKING_CAPITAL], approvalLimit: null } });
    await call(`/api/admin/staff/${payrollOfficer.id}/access`, { method: 'PUT', token: adminToken, body: { grants: ['payroll.manage'], denies: [], productIds: [productIds.DEMO_PAYROLL], approvalLimit: null } });

    const pdf = Buffer.from('%PDF-1.4\n% Demo document — not a real record\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
    const upload = async (token: string, fields: Record<string, string>, name: string) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.append(key, value);
      form.append('file', new Blob([pdf], { type: 'application/pdf' }), name);
      return call('/api/documents', { token, form });
    };
    const register = async (fullName: string, extra: Record<string, unknown>) => {
      const pass = password();
      const email = `${fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@demo.pinnacle.test`;
      const result = await call('/api/auth/register', {
        body: { fullName, email, phone: `+265 99${Math.floor(1_000_000 + Math.random() * 8_999_999)}`, nationalId: `DEMO-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          password: pass, securityQuestion: 'Demo question', securityAnswer: 'demo', ...extra },
      });
      created.users.push(result.profile.id);
      created.customers.push(result.profile.customer.id);
      credentials.push(`${'Customer'.padEnd(22)} ${email.padEnd(38)} ${pass}`);
      return { token: result.token as string, customerId: result.profile.customer.id as string };
    };

    // ── Payroll borrower: full lifecycle, disbursed with one repayment ──────
    const payrollBorrower = await register('Demo Payroll Borrower', { employeeNumber: 'DEMO-EMP-001', employerName: 'Demo Employer', monthlyIncome: 450_000 });
    const docs1 = [
      await upload(payrollBorrower.token, { documentType: 'national_id_front' }, 'id-front.pdf'),
      await upload(payrollBorrower.token, { documentType: 'national_id_back' }, 'id-back.pdf'),
    ];
    const app1 = await call('/api/applications', { token: payrollBorrower.token, body: { productId: productIds.DEMO_PAYROLL, amount: 600_000, termMonths: 12, purpose: 'School fees (demo)', declared: { monthlyNetIncome: 450_000, existingMonthlyDeductions: 60_000 } } });
    docs1.push(await upload(payrollBorrower.token, { documentType: 'payslip', applicationId: app1.id }, 'payslip.pdf'));
    created.applications.push(app1.id);
    await call(`/api/applications/${app1.id}/submit`, { method: 'POST', token: payrollBorrower.token });
    await call(`/api/applications/${app1.id}/assign`, { token: manager.token, body: { officerId: payrollOfficer.id } });
    for (const doc of docs1) await call(`/api/documents/${doc.id}/review`, { token: payrollOfficer.token, body: { decision: 'verified' } });
    await call(`/api/applications/${app1.id}/assess`, { token: payrollOfficer.token, body: { officerSummary: 'Demo assessment: declared income supports the installment.' } });
    await call(`/api/applications/${app1.id}/recommend`, { token: payrollOfficer.token, body: { recommendation: 'approve', note: 'Demo recommendation to approve.' } });
    await call(`/api/applications/${app1.id}/approve`, { token: manager.token, body: { reason: 'Demo approval within policy.' } });
    await call(`/api/applications/${app1.id}/offer`, { token: payrollOfficer.token, body: {} });
    await call(`/api/applications/${app1.id}/offer/respond`, { token: payrollBorrower.token, body: { accept: true } });
    const detail1 = await call(`/api/applications/${app1.id}`, { token: payrollOfficer.token });
    const net = detail1.offers[0].schedule.netDisbursement;
    const disbursedOn = new Date(Date.now() - 70 * 86_400_000).toISOString().slice(0, 10);
    const disb = await call(`/api/applications/${app1.id}/transactions`, { token: payrollOfficer.token, body: { type: 'disbursement', amount: net, valueDate: disbursedOn, channel: 'bank_transfer', externalReference: `DEMO-DISB-${crypto.randomBytes(3).toString('hex')}` } });
    await call(`/api/transactions/${disb.id}/confirm`, { method: 'POST', token: manager.token });
    const afterDisb = await call(`/api/applications/${app1.id}`, { token: payrollOfficer.token });
    const firstInstallment = afterDisb.schedule[0].total;
    const rep = await call(`/api/applications/${app1.id}/transactions`, { token: payrollOfficer.token, body: { type: 'repayment', amount: firstInstallment, valueDate: afterDisb.schedule[0].dueDate, channel: 'payroll', externalReference: `DEMO-PAY-${crypto.randomBytes(3).toString('hex')}` } });
    await call(`/api/transactions/${rep.id}/confirm`, { method: 'POST', token: manager.token });

    // ── SME owner: verified member and business, application awaiting approval ──
    const smeOwner = await register('Demo SME Owner', { segment: 'sme' });
    const business = await call('/api/businesses', { token: smeOwner.token, body: {
      registeredName: 'Demo Traders Limited', legalStructure: 'private_limited', registrationNumber: `DEMO-REG-${crypto.randomBytes(3).toString('hex')}`,
      sector: 'Retail', district: 'Lilongwe', dateEstablished: '2020-02-01', employeeCount: 8, myRole: 'owner', ownershipPct: 100,
      description: 'Demo business for testing.',
    } });
    created.businesses.push(business.id);
    await call(`/api/businesses/${business.id}/financials`, { token: smeOwner.token, body: { periodStart: '2026-01-01', periodEnd: '2026-06-30', avgMonthlyRevenue: 12_000_000, avgMonthlyCostOfSales: 6_500_000, avgMonthlyOperatingExpenses: 2_000_000, existingMonthlyDebtService: 300_000, largestCustomerShare: 0.25 } });
    const bizDocs = [];
    for (const type of ['business_registration', 'tax_clearance', 'bank_statement']) bizDocs.push(await upload(smeOwner.token, { documentType: type, businessId: business.id }, `${type}.pdf`));
    await call('/api/members', { token: manager.token, body: { customerId: smeOwner.customerId, memberNumber: `DEMO-M-${crypto.randomBytes(2).toString('hex').toUpperCase()}`, joinedOn: '2023-05-01', status: 'active' } });
    const memberRow = await one('SELECT id FROM members WHERE customer_id = $1', [smeOwner.customerId]);
    created.members.push(memberRow.id);
    const bizDetail = await call(`/api/businesses/${business.id}`, { token: manager.token });
    await call(`/api/businesses/${business.id}/parties/${bizDetail.parties[0].id}/verify`, { token: manager.token, body: { verified: true } });
    for (const doc of bizDocs) await call(`/api/documents/${doc.id}/review`, { token: smeOfficer.token, body: { decision: 'verified' } });
    await call(`/api/businesses/${business.id}/verify`, { token: manager.token, body: { decision: 'verified' } });
    const app2 = await call('/api/applications', { token: smeOwner.token, body: { productId: productIds.DEMO_WORKING_CAPITAL, businessId: business.id, amount: 8_000_000, termMonths: 9, purpose: 'Seasonal stock (demo)' } });
    created.applications.push(app2.id);
    await call(`/api/applications/${app2.id}/submit`, { method: 'POST', token: smeOwner.token });
    await call(`/api/applications/${app2.id}/assign`, { token: manager.token, body: { officerId: smeOfficer.id } });
    await call(`/api/applications/${app2.id}/assess`, { token: smeOfficer.token, body: { officerSummary: 'Demo assessment on applicant-declared figures; verified bank statement on file.' } });
    await call(`/api/applications/${app2.id}/recommend`, { token: smeOfficer.token, body: { recommendation: 'approve', note: 'Demo recommendation: cash flow appears adequate.' } });

    // ── New applicant: submitted, waiting to be assigned ────────────────────
    const newApplicant = await register('Demo New Applicant', { monthlyIncome: 300_000 });
    await upload(newApplicant.token, { documentType: 'national_id_front' }, 'front.pdf');
    await upload(newApplicant.token, { documentType: 'national_id_back' }, 'back.pdf');
    const app3 = await call('/api/applications', { token: newApplicant.token, body: { productId: productIds.DEMO_PAYROLL, amount: 250_000, termMonths: 6, purpose: 'Household repairs (demo)', declared: { monthlyNetIncome: 300_000 } } });
    await upload(newApplicant.token, { documentType: 'payslip', applicationId: app3.id }, 'payslip.pdf');
    created.applications.push(app3.id);
    await call(`/api/applications/${app3.id}/submit`, { method: 'POST', token: newApplicant.token });

    // ── Mark everything as demo data ────────────────────────────────────────
    await query(`UPDATE users SET data_source = 'demo' WHERE id = ANY($1)`, [created.users]);
    await query(`UPDATE customers SET data_source = 'demo' WHERE id = ANY($1)`, [created.customers]);
    await query(`UPDATE businesses SET data_source = 'demo' WHERE id = ANY($1)`, [created.businesses]);
    await query(`UPDATE members SET data_source = 'demo' WHERE id = ANY($1)`, [created.members]);
    await query(`UPDATE loan_products SET data_source = 'demo' WHERE id = ANY($1)`, [created.products]);
    await query(`UPDATE loan_applications SET data_source = 'demo' WHERE id = ANY($1)`, [created.applications]);
    await query(`UPDATE loan_transactions SET data_source = 'demo' WHERE application_id = ANY($1)`, [created.applications]);
    await query(`UPDATE documents SET data_source = 'demo' WHERE customer_id = ANY($1) OR business_id = ANY($2) OR application_id = ANY($3)`, [created.customers, created.businesses, created.applications]);

    const file = path.join(process.cwd(), '.local', 'demo-credentials.txt');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `Demo accounts (local development only) — generated ${new Date().toISOString()}\n\n${credentials.join('\n')}\n`, { mode: 0o600 });
    console.log(`Demo data created. Credentials written to ${file}`);
  } finally {
    server.close();
  }
}

main().then(() => pool.end()).catch(async error => {
  console.error('[seed] failed:', error.message);
  await pool.end();
  process.exit(1);
});
