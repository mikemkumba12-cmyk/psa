import './env';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { api, createStaff, fileForm, registerCustomer, SAMPLE_PDF, SAMPLE_PNG, startTestServer, type TestContext } from './helpers';
import { one } from '../db/pool';
import { config } from '../config';

let ctx: TestContext;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.close(); });

async function uploadId(token: string, file = SAMPLE_PNG, name = 'id-front.png', mime = 'image/png') {
  return api(ctx, '/api/documents', { token, form: fileForm({ documentType: 'national_id_front' }, file, name, mime) });
}

describe('document upload and storage', () => {
  it('stores the file privately, records metadata, and links it to the customer', async () => {
    const customer = await registerCustomer(ctx);
    const uploaded = await uploadId(customer.token);
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    assert.equal(uploaded.body.status, 'pending_review');
    assert.equal(uploaded.body.customerId, customer.profile.customer.id);
    assert.equal(uploaded.body.mimeType, 'image/png');

    const row = await one('SELECT storage_key, sha256, size_bytes FROM documents WHERE id = $1', [uploaded.body.id]);
    assert.ok(row.storage_key);
    assert.equal(row.size_bytes, SAMPLE_PNG.length);
    const onDisk = await fs.readFile(path.join(config.documents.localDir, row.storage_key));
    assert.ok(onDisk.length > 0, 'file persisted to storage');
    assert.ok(!row.storage_key.includes(customer.profile.customer.id), 'storage key carries no customer information');

    const listed = await api(ctx, '/api/documents', { token: customer.token });
    assert.equal(listed.body.length, 1);

    const content = await api(ctx, `/api/documents/${uploaded.body.id}/content`, { token: customer.token });
    assert.equal(content.status, 200);
    assert.ok(Buffer.compare(content.body, SAMPLE_PNG) === 0, 'returns the exact bytes uploaded');
    assert.equal(content.headers.get('cache-control'), 'private, no-store');
  });

  it('rejects files whose content is not an accepted format, whatever their name says', async () => {
    const customer = await registerCustomer(ctx);
    const fake = await uploadId(customer.token, Buffer.from('MZ this is an executable pretending to be a pdf'), 'id.pdf', 'application/pdf');
    assert.equal(fake.status, 422);
    const empty = await uploadId(customer.token, Buffer.alloc(0), 'empty.pdf', 'application/pdf');
    assert.equal(empty.status, 400);
  });

  it('enforces the size limit', async () => {
    const customer = await registerCustomer(ctx);
    const big = Buffer.concat([SAMPLE_PDF, Buffer.alloc(config.documents.maxBytes + 10)]);
    const response = await uploadId(customer.token, big, 'big.pdf', 'application/pdf');
    assert.equal(response.status, 413);
  });

  it('requires the document to be attached to the right kind of owner', async () => {
    const customer = await registerCustomer(ctx);
    const response = await api(ctx, '/api/documents', {
      token: customer.token,
      form: fileForm({ documentType: 'business_registration' }, SAMPLE_PDF, 'reg.pdf'),
    });
    assert.equal(response.status, 400);
  });
});

describe('document access control', () => {
  it('another customer cannot list, view or download the document', async () => {
    const owner = await registerCustomer(ctx);
    const intruder = await registerCustomer(ctx);
    const doc = (await uploadId(owner.token)).body;

    assert.equal((await api(ctx, `/api/documents/${doc.id}/content`, { token: intruder.token })).status, 404);
    const list = await api(ctx, `/api/documents?customerId=${owner.profile.customer.id}`, { token: intruder.token });
    assert.equal(list.status, 404);
    assert.equal((await api(ctx, `/api/documents/${doc.id}/content`)).status, 401, 'no anonymous access');
  });

  it('staff need documents.view to open customer documents', async () => {
    const owner = await registerCustomer(ctx);
    const doc = (await uploadId(owner.token)).body;
    const officer = await createStaff(ctx, 'loan_officer');
    const restricted = await createStaff(ctx, 'loan_officer', { deny: ['documents.view'] });

    const viewed = await api(ctx, `/api/documents/${doc.id}/content?disposition=attachment`, { token: officer.token });
    assert.equal(viewed.status, 200);
    assert.match(viewed.headers.get('content-disposition') || '', /^attachment/);
    assert.equal((await api(ctx, `/api/documents/${doc.id}/content`, { token: restricted.token })).status, 403);

    const audited = await one(`SELECT count(*)::int AS n FROM audit_logs WHERE entity_id = $1 AND action = 'document.download'`, [doc.id]);
    assert.equal(audited.n, 1, 'downloads are audited');
  });
});

describe('document review, replacement and removal', () => {
  it('officers verify or reject with a reason; the customer is notified of rejection', async () => {
    const owner = await registerCustomer(ctx);
    const doc = (await uploadId(owner.token)).body;
    const officer = await createStaff(ctx, 'loan_officer');

    const noReason = await api(ctx, `/api/documents/${doc.id}/review`, { token: officer.token, body: { decision: 'rejected' } });
    assert.equal(noReason.status, 400);
    const rejected = await api(ctx, `/api/documents/${doc.id}/review`, { token: officer.token, body: { decision: 'rejected', note: 'Image is blurred' } });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.status, 'rejected');

    const notes = await api(ctx, '/api/notifications', { token: owner.token });
    assert.ok(notes.body.items.some((item: any) => item.entityId === doc.id));

    const customerReview = await api(ctx, `/api/documents/${doc.id}/review`, { token: owner.token, body: { decision: 'verified' } });
    assert.equal(customerReview.status, 403, 'customers cannot verify their own documents');
  });

  it('a replacement supersedes the old version and keeps history', async () => {
    const owner = await registerCustomer(ctx);
    const first = (await uploadId(owner.token)).body;
    const second = await api(ctx, '/api/documents', {
      token: owner.token,
      form: fileForm({ documentType: 'national_id_front', replacesDocumentId: first.id }, SAMPLE_PNG, 'clearer.png', 'image/png'),
    });
    assert.equal(second.status, 201);
    const current = await api(ctx, '/api/documents', { token: owner.token });
    assert.deepEqual(current.body.map((doc: any) => doc.id), [second.body.id]);
    const history = await api(ctx, '/api/documents?includeHistory=true', { token: owner.token });
    assert.equal(history.body.length, 2);
  });

  it('customers can remove unverified uploads; verified ones are protected', async () => {
    const owner = await registerCustomer(ctx);
    const pending = (await uploadId(owner.token)).body;
    assert.equal((await api(ctx, `/api/documents/${pending.id}`, { method: 'DELETE', token: owner.token, body: { reason: 'Wrong file' } })).status, 204);
    assert.equal((await api(ctx, `/api/documents/${pending.id}/content`, { token: owner.token })).status, 404);

    const verified = (await uploadId(owner.token)).body;
    const officer = await createStaff(ctx, 'loan_officer');
    await api(ctx, `/api/documents/${verified.id}/review`, { token: officer.token, body: { decision: 'verified' } });
    assert.equal((await api(ctx, `/api/documents/${verified.id}`, { method: 'DELETE', token: owner.token, body: { reason: 'Changed my mind' } })).status, 403);
  });

  it('documents persist across a new sign-in session', async () => {
    const owner = await registerCustomer(ctx);
    await uploadId(owner.token);
    await api(ctx, '/api/auth/logout', { method: 'POST', token: owner.token });
    const relogin = await api(ctx, '/api/auth/login', { body: { email: owner.email, password: owner.password } });
    const docs = await api(ctx, '/api/documents', { token: relogin.body.token });
    assert.equal(docs.body.length, 1);
  });
});
