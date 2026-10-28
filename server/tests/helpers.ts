import './env';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import fs from 'fs/promises';
import { config } from '../config';
import { pool, query } from '../db/pool';
import { resetDatabase, runMigrations } from '../database/migrate';
import { createApp } from '../app';
import { hashSecret } from '../auth/passwords';
import { newId } from '../lib/ids';

export interface TestContext {
  baseUrl: string;
  close: () => Promise<void>;
}

let counter = 0;
export function unique(prefix = 'x'): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 6)}`;
}

/** Fresh schema + running API. Call once per test file (tests run with --test-concurrency=1). */
export async function startTestServer(): Promise<TestContext> {
  if (!config.isTest || !config.database.url.includes('test')) {
    throw new Error(`Refusing to run tests against a non-test database: ${config.database.url}`);
  }
  await resetDatabase(true);
  await runMigrations({ quiet: true });
  await fs.rm(config.documents.localDir, { recursive: true, force: true });

  const server: Server = await new Promise(resolve => {
    const instance = createApp().listen(0, () => resolve(instance));
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await pool.end();
    },
  };
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export async function api<T = any>(
  ctx: TestContext,
  path: string,
  options: { method?: string; token?: string; body?: unknown; form?: FormData; headers?: Record<string, string> } = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${ctx.baseUrl}${path}`, { method: options.method || (body ? 'POST' : 'GET'), headers, body });
  const type = response.headers.get('content-type') || '';
  const parsed = type.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, body: parsed as T, headers: response.headers };
}

export const STRONG_PASSWORD = 'Harvest2026season';

export async function registerCustomer(ctx: TestContext, overrides: Record<string, unknown> = {}) {
  const tag = unique('c');
  const payload = {
    fullName: `Test Customer ${tag}`,
    email: `${tag}@example.test`,
    phone: `+265 99${Math.floor(1000000 + Math.random() * 8999999)}`,
    nationalId: `NID${tag}`.toUpperCase(),
    password: STRONG_PASSWORD,
    securityQuestion: 'What is the name of your first school?',
    securityAnswer: 'Chilomoni',
    segment: 'individual',
    monthlyIncome: 450000,
    ...overrides,
  };
  const response = await api(ctx, '/api/auth/register', { body: payload });
  if (response.status !== 201) throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
  return { token: response.body.token as string, profile: response.body.profile, email: payload.email, password: payload.password };
}

/** Creates a staff account directly in the database and signs it in. */
export async function createStaff(
  ctx: TestContext,
  role: 'loan_officer' | 'manager' | 'executive' | 'admin',
  options: { grant?: string[]; deny?: string[]; products?: string[]; approvalLimit?: number } = {},
) {
  const tag = unique('s');
  const id = newId('usr');
  const email = `${tag}@staff.test`;
  await query(
    `INSERT INTO users (id, email, password_hash, name, role, approval_limit, data_source) VALUES ($1, $2, $3, $4, $5, $6, 'test')`,
    [id, email, await hashSecret(STRONG_PASSWORD), `Staff ${tag}`, role, options.approvalLimit ?? null],
  );
  for (const permission of options.grant || []) {
    await query(`INSERT INTO user_permissions (user_id, permission_id, effect) VALUES ($1, $2, 'grant')`, [id, permission]);
  }
  for (const permission of options.deny || []) {
    await query(`INSERT INTO user_permissions (user_id, permission_id, effect) VALUES ($1, $2, 'deny')`, [id, permission]);
  }
  for (const productId of options.products || []) {
    await query('INSERT INTO user_product_access (user_id, product_id) VALUES ($1, $2)', [id, productId]);
  }
  const login = await api(ctx, '/api/auth/login', { body: { email, password: STRONG_PASSWORD } });
  if (login.status !== 200) throw new Error(`staff login failed: ${JSON.stringify(login.body)}`);
  return { id, email, token: login.body.token as string };
}

// Minimal valid files for upload tests.
export const SAMPLE_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
export const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export function fileForm(fields: Record<string, string>, file: Buffer, fileName: string, mime = 'application/pdf'): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append('file', new Blob([file], { type: mime }), fileName);
  return form;
}
