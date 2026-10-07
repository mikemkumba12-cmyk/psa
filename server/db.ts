import bcrypt from 'bcrypt';
import type { Pool as PoolType, QueryResult } from 'pg';
import {
  initialAlertNotifications,
  initialCustomers,
  initialLoanApplications,
  initialRepayments,
  initialSmeBusinesses,
} from '../src/data';
import type {
  AlertNotification,
  AuditLogEntry,
  Customer,
  LoanApplication,
  Repayment,
  SmeBusiness,
  StoredUser,
} from '../src/types';
import { ensureMockSchema, mockDb, mockDbFilePath, seedMockInitialData } from './mockDb';

type DbConfig =
  | {
      connectionString: string;
      ssl?: { rejectUnauthorized: boolean };
      connectionTimeoutMillis?: number;
    }
  | {
      host: string;
      port: number;
      database: string;
      user: string;
      password?: string;
      ssl?: { rejectUnauthorized: boolean };
      connectionTimeoutMillis?: number;
    };


const configuredBcryptRounds = Number(process.env.BCRYPT_ROUNDS || 12);
const bcryptRounds = Number.isFinite(configuredBcryptRounds) ? configuredBcryptRounds : 12;

async function hashSecret(value: string): Promise<string> {
  return bcrypt.hash(value, bcryptRounds);
}
if (process.env.PGPASSWORD === '') {
  delete process.env.PGPASSWORD;
}

const { Pool } = await import('pg');

const dbConfig: DbConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: Number(process.env.PGCONNECT_TIMEOUT_MS || 1500),
    }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'pinaco',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD ?? '',
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: Number(process.env.PGCONNECT_TIMEOUT_MS || 1500),
    };


const pool: PoolType = new Pool(dbConfig as any);
let storageMode: 'postgres' | 'file' =
  process.env.PSA_STORAGE_MODE === 'file' || process.env.MOCK_DB_MODE === 'file' || !process.env.DATABASE_URL
    ? 'file'
    : 'postgres';

function usingFileDb(): boolean {
  return storageMode === 'file';
}

export function getStorageMode(): 'postgres' | 'file' {
  return storageMode;
}

/** Returns true if PostgreSQL is reachable; switches storageMode to 'file' if not. */
export async function ensurePostgresAvailable(): Promise<boolean> {
  if (usingFileDb()) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error: any) {
    console.warn(`[Pinnacle API] PostgreSQL not available (${error?.message ?? 'connection failed'}). Switching to file storage mode.`);
    storageMode = 'file';
    return false;
  }
}

export async function query<T>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
  if (usingFileDb()) {
    throw new Error('SQL query is unavailable while using the file-backed mock database.');
  }
  try {
    return (await pool.query(text, params)) as QueryResult<T>;
  } catch (error: any) {
    console.warn(`[Pinnacle API] PostgreSQL query failed (${error?.message || 'connection failed'}). Switching to file storage mode.`);
    storageMode = 'file';
    throw error;
  }
}

export async function getAllLoanApplications(): Promise<LoanApplication[]> {
  if (usingFileDb()) return mockDb.getAllLoanApplications();
  const result = await query<{ data: LoanApplication }>('SELECT data FROM loan_applications ORDER BY data->>\'date\' DESC');
  return result.rows.map(row => row.data);
}

export async function getLoanApplicationById(id: string): Promise<LoanApplication | null> {
  if (usingFileDb()) return mockDb.getLoanApplicationById(id);
  const result = await query<{ data: LoanApplication }>('SELECT data FROM loan_applications WHERE id = $1', [id]);
  return result.rows[0]?.data ?? null;
}

export async function upsertLoanApplication(application: LoanApplication): Promise<void> {
  if (usingFileDb()) return mockDb.upsertLoanApplication(application);
  await query(
    'INSERT INTO loan_applications (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
    [application.id, application]
  );
}

export async function getAllRepayments(): Promise<Repayment[]> {
    if (usingFileDb()) return mockDb.getAllRepayments();
const result = await query<{ data: Repayment }>('SELECT data FROM repayments ORDER BY data->>\'dueDate\' DESC');
  return result.rows.map(row => row.data);
}

export async function getRepaymentById(id: string): Promise<Repayment | null> {
    if (usingFileDb()) return mockDb.getRepaymentById(id);
const result = await query<{ data: Repayment }>('SELECT data FROM repayments WHERE id = $1', [id]);
  return result.rows[0]?.data ?? null;
}

export async function upsertRepayment(repayment: Repayment): Promise<void> {
    if (usingFileDb()) return mockDb.upsertRepayment(repayment);
await query(
    'INSERT INTO repayments (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
    [repayment.id, repayment]
  );
}

export async function getAllCustomers(): Promise<Customer[]> {
    if (usingFileDb()) return mockDb.getAllCustomers();
const result = await query<{ data: Customer }>('SELECT data FROM customers ORDER BY data->>\'name\' ASC');
  return result.rows.map(row => row.data);
}

export async function upsertCustomer(customer: Customer): Promise<void> {
    if (usingFileDb()) return mockDb.upsertCustomer(customer);
await query(
    'INSERT INTO customers (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
    [customer.id, customer]
  );
}

export async function getAllBusinesses(): Promise<SmeBusiness[]> {
    if (usingFileDb()) return mockDb.getAllBusinesses();
const result = await query<{ data: SmeBusiness }>('SELECT data FROM businesses ORDER BY data->>\'name\' ASC');
  return result.rows.map(row => row.data);
}

export async function getBusinessesByCustomerId(customerId: string): Promise<SmeBusiness[]> {
  if (usingFileDb()) return mockDb.getBusinessesByCustomerId(customerId);
  const aliases = customerId.startsWith('cust-')
    ? [customerId, customerId.slice(5)]
    : [customerId, `cust-${customerId}`];
  const result = await query<{ data: SmeBusiness }>(
    'SELECT data FROM businesses WHERE data->>\'customerId\' = ANY($1::text[]) ORDER BY data->>\'name\' ASC',
    [aliases]
  );
  return result.rows.map(row => row.data);
}

export async function getBusinessById(id: string): Promise<SmeBusiness | null> {
    if (usingFileDb()) return mockDb.getBusinessById(id);
const result = await query<{ data: SmeBusiness }>('SELECT data FROM businesses WHERE id = $1', [id]);
  return result.rows[0]?.data ?? null;
}

export async function upsertBusiness(business: SmeBusiness): Promise<void> {
    if (usingFileDb()) return mockDb.upsertBusiness(business);
await query(
    'INSERT INTO businesses (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
    [business.id, business]
  );
}

export async function getAllAlerts(): Promise<AlertNotification[]> {
    if (usingFileDb()) return mockDb.getAllAlerts();
const result = await query<{ data: AlertNotification }>('SELECT data FROM alerts ORDER BY data->>\'date\' DESC');
  return result.rows.map(row => row.data);
}

export async function upsertAlert(alert: AlertNotification): Promise<void> {
    if (usingFileDb()) return mockDb.upsertAlert(alert);
await query(
    'INSERT INTO alerts (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
    [alert.id, alert]
  );
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
    if (usingFileDb()) return mockDb.getUserByEmail(email);
const result = await query<{ data: StoredUser }>(
    'SELECT data FROM users WHERE lower(data->>\'email\') = lower($1)',
    [email]
  );
  return result.rows[0]?.data ?? null;
}

export async function getUserById(id: string): Promise<StoredUser | null> {
    if (usingFileDb()) return mockDb.getUserById(id);
const result = await query<{ data: StoredUser }>('SELECT data FROM users WHERE id = $1', [id]);
  return result.rows[0]?.data ?? null;
}

export async function upsertUser(user: StoredUser): Promise<void> {
    if (usingFileDb()) return mockDb.upsertUser(user);
await query(
    'INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
    [user.id, user]
  );
}

export async function getDocumentsForUser(userId: string): Promise<unknown[]> {
    if (usingFileDb()) return mockDb.getDocumentsForUser(userId);
const result = await query<{ data: unknown }>('SELECT data FROM documents WHERE data->>\'userId\' = $1 ORDER BY data->>\'uploadedAt\' DESC', [userId]);
  return result.rows.map(row => row.data);
}

export async function upsertDocument(document: unknown & { id: string }): Promise<void> {
    if (usingFileDb()) return mockDb.upsertDocument(document);
await query(
    'INSERT INTO documents (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
    [document.id, document]
  );
}

export async function getAllAuditLogs(): Promise<AuditLogEntry[]> {
    if (usingFileDb()) return mockDb.getAllAuditLogs();
const result = await query<{ data: AuditLogEntry }>('SELECT data FROM audit_logs ORDER BY occurred_at DESC');
  return result.rows.map(row => row.data);
}

export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
    if (usingFileDb()) return mockDb.createAuditLog(entry);
await query(
    'INSERT INTO audit_logs (id, occurred_at, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
    [entry.id, entry.occurredAt, entry]
  );
}

export async function ensureSchema(): Promise<void> {
    if (!(await ensurePostgresAvailable())) {
    await ensureMockSchema();
    return;
  }
await query(`
    CREATE TABLE IF NOT EXISTS loan_applications (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repayments (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      participant_ids JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      last_message_at TIMESTAMPTZ DEFAULT now(),
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL,
      content TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_by JSONB DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv_sent ON messages (conversation_id, sent_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(data->>'email'));
  `);
}

export async function seedInitialData(): Promise<void> {
    if (usingFileDb()) {
    await seedMockInitialData();
    return;
  }
const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT count(*) FROM loan_applications');
    const currentCount = rows?.[0]?.count ? Number(rows[0].count) : 0;

    if (currentCount === 0) {
      for (const application of initialLoanApplications) {
        await client.query(
          'INSERT INTO loan_applications (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
          [application.id, application]
        );
      }
    }

    for (const repayment of initialRepayments) {
      await client.query(
        'INSERT INTO repayments (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [repayment.id, repayment]
      );
    }

    for (const customer of initialCustomers) {
      await client.query(
        'INSERT INTO customers (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [customer.id, customer]
      );
    }

    for (const alert of initialAlertNotifications) {
      await client.query(
        'INSERT INTO alerts (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [alert.id, alert]
      );
    }

    for (const business of initialSmeBusinesses) {
      await client.query(
        'INSERT INTO businesses (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [business.id, business]
      );
    }

    const userCountResult = await client.query('SELECT count(*) FROM users');
    const userCount = Number(userCountResult.rows?.[0]?.count ?? 0);
    if (userCount === 0) {
      const passwordHash = await hashSecret('PINACO@2026');
      const answerHash = await hashSecret('lilongwe');
      const demoStaff: StoredUser[] = [
        {
          id: 'staff-001',
          role: 'admin',
          fullName: 'Thoko Kamanga (Demo)',
          email: 'admin@pinnacle.mw',
          phone: '+265 111 000 001',
          address: 'Pinnacle MFI HQ, Lilongwe',
          nationalId: 'STAFF-001',
          dob: '1985-04-12',
          gender: 'Male',
          employmentType: 'Employed',
          employer: 'Pinnacle MFI',
          monthlyIncome: '1200000',
          customerType: 'individual',
          passwordHash,
          securityQuestion: 'What city were you born in?',
          securityAnswerHash: answerHash,
          createdAt: new Date().toISOString(),
          notificationPrefs: { sms: true, email: true, push: true },
          staffTitle: 'System Administrator (Demo)',
        },
        {
          id: 'staff-002',
          role: 'loan_officer',
          fullName: 'Chisomo Banda (Demo)',
          email: 'chisomo@pinnacle.mw',
          phone: '+265 888 100 001',
          address: 'Pinnacle Lilongwe Branch',
          nationalId: 'STAFF-002',
          dob: '1992-08-23',
          gender: 'Male',
          employmentType: 'Employed',
          employer: 'Pinnacle MFI',
          monthlyIncome: '750000',
          customerType: 'individual',
          passwordHash,
          securityQuestion: 'What city were you born in?',
          securityAnswerHash: answerHash,
          createdAt: new Date().toISOString(),
          notificationPrefs: { sms: true, email: true, push: true },
          staffTitle: 'Loan Officer (Demo)',
        },
        {
          id: 'staff-003',
          role: 'manager',
          fullName: 'Grace Phiri (Demo)',
          email: 'grace@pinnacle.mw',
          phone: '+265 999 200 002',
          address: 'Pinnacle Lilongwe Branch',
          nationalId: 'STAFF-003',
          dob: '1988-11-05',
          gender: 'Female',
          employmentType: 'Employed',
          employer: 'Pinnacle MFI',
          monthlyIncome: '950000',
          customerType: 'individual',
          passwordHash,
          securityQuestion: 'What city were you born in?',
          securityAnswerHash: answerHash,
          createdAt: new Date().toISOString(),
          notificationPrefs: { sms: true, email: true, push: true },
          staffTitle: 'Operations Manager (Demo)',
        },
        {
          id: 'staff-004',
          role: 'executive',
          fullName: 'Kondwani Mbewe (Demo)',
          email: 'kondwani@pinnacle.mw',
          phone: '+265 888 300 003',
          address: 'Pinnacle HQ, Lilongwe',
          nationalId: 'STAFF-004',
          dob: '1979-02-28',
          gender: 'Male',
          employmentType: 'Employed',
          employer: 'Pinnacle MFI',
          monthlyIncome: '1500000',
          customerType: 'individual',
          passwordHash,
          securityQuestion: 'What city were you born in?',
          securityAnswerHash: answerHash,
          createdAt: new Date().toISOString(),
          notificationPrefs: { sms: true, email: true, push: true },
          staffTitle: 'Executive Director (Demo)',
        }
      ];

      for (const staffUser of demoStaff) {
        await client.query(
          'INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
          [staffUser.id, staffUser]
        );
      }
    }

    const initialAudit: AuditLogEntry = {
      id: 'audit-seed-001',
      occurredAt: new Date().toISOString(),
      actorId: 'system',
      actorName: 'Pinnacle Platform',
      actorRole: 'system',
      action: 'system.seed_demo_data',
      entityType: 'system',
      outcome: 'success',
      summary: 'Initial demo data seeded for the digital lending prototype.',
      metadata: {},
    };

    await client.query(
      'INSERT INTO audit_logs (id, occurred_at, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [initialAudit.id, initialAudit.occurredAt, initialAudit]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Dashboard Summary ────────────────────────────────────────────────────────
export async function getDashboardSummary() {
    if (usingFileDb()) return mockDb.getDashboardSummary();
const [apps, reps, auditLogs] = await Promise.all([
    query<{ data: any }>('SELECT data FROM loan_applications'),
    query<{ data: any }>('SELECT data FROM repayments'),
    query<{ data: any }>('SELECT data FROM audit_logs ORDER BY occurred_at DESC LIMIT 10'),
  ]);

  const appRows = apps.rows.map(r => r.data);
  const repRows = reps.rows.map(r => r.data);

  const totalDisbursed = appRows
    .filter((a: any) => a.status === 'Disbursed' || a.status === 'Approved')
    .reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0);

  const totalCollected = repRows
    .filter((r: any) => r.status === 'Paid')
    .reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);

  const collectionRate = totalDisbursed > 0
    ? ((totalCollected / totalDisbursed) * 100).toFixed(2)
    : '0.00';

  const pendingCount = appRows.filter((a: any) =>
    ['Under Review', 'In Progress', 'Reviewing'].includes(a.status)
  ).length;

  const activeCount = appRows.filter((a: any) =>
    a.status === 'Approved' || a.status === 'Disbursed'
  ).length;

  // Approx interest earned (10% flat of disbursed for demo)
  const totalInterestEarned = Math.round(totalDisbursed * 0.10);

  // Monthly disbursement breakdown for charts
  const monthlyMap: Record<string, number> = {};
  for (const a of appRows) {
    if (!a.date) continue;
    const month = a.date.slice(0, 7); // 'YYYY-MM'
    monthlyMap[month] = (monthlyMap[month] || 0) + Number(a.amount || 0);
  }
  const monthlyDisbursements = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, amount]) => ({
      name: new Date(month + '-01').toLocaleString('default', { month: 'short' }),
      amount,
    }));

  // Sector breakdown
  const sectorMap: Record<string, { disbursed: number; count: number }> = {};
  for (const a of appRows) {
    const s = a.sector || 'Other';
    if (!sectorMap[s]) sectorMap[s] = { disbursed: 0, count: 0 };
    sectorMap[s].disbursed += Number(a.amount || 0);
    sectorMap[s].count++;
  }
  const sectorBreakdown = Object.entries(sectorMap).map(([sector, v]) => ({
    sector,
    disbursed: v.disbursed,
    count: v.count,
    pct: totalDisbursed > 0 ? Math.round((v.disbursed / totalDisbursed) * 100) : 0,
  })).sort((a, b) => b.disbursed - a.disbursed);

  const recentAudit = auditLogs.rows.map(r => r.data);

  return {
    totalDisbursed,
    totalCollected,
    collectionRate: Number(collectionRate),
    totalInterestEarned,
    pendingCount,
    activeCount,
    totalApplications: appRows.length,
    monthlyDisbursements,
    sectorBreakdown,
    recentAuditActivity: recentAudit,
  };
}

// ── Messages & Conversations ─────────────────────────────────────────────────
export async function listConversations(userId: string) {
    if (usingFileDb()) return mockDb.listConversations(userId);
const { rows } = await query<{ id: string; data: any; last_message_at: string }>(
    `SELECT c.id, c.data, c.last_message_at,
      (
        SELECT json_build_object('content', m.content, 'sender_id', m.sender_id, 'sent_at', m.sent_at)
        FROM messages m WHERE m.conversation_id = c.id
        ORDER BY m.sent_at DESC LIMIT 1
      ) AS last_msg,
      (
        SELECT count(*) FROM messages m
        WHERE m.conversation_id = c.id
          AND NOT (m.read_by @> jsonb_build_array($1::text))
          AND m.sender_id != $1
      ) AS unread_count
    FROM conversations c
    WHERE c.participant_ids @> jsonb_build_array($1::text)
    ORDER BY c.last_message_at DESC`,
    [userId]
  );
  return rows;
}

export async function getOrCreateConversation(userId: string, staffId: string) {
    if (usingFileDb()) return mockDb.getOrCreateConversation(userId, staffId);
// Check existing
  const { rows } = await query<{ id: string; data: any }>(
    `SELECT id, data FROM conversations
     WHERE participant_ids @> $1::jsonb AND participant_ids @> $2::jsonb
     LIMIT 1`,
    [JSON.stringify([userId]), JSON.stringify([staffId])]
  );
  if (rows.length > 0) return rows[0];

  // Create new
  const id = `conv-${Date.now()}`;
  const data = { id, participantIds: [userId, staffId] };
  await query(
    `INSERT INTO conversations (id, participant_ids, data) VALUES ($1, $2, $3)`,
    [id, JSON.stringify([userId, staffId]), data]
  );
  return { id, data };
}

export async function getMessages(conversationId: string, after?: string) {
    if (usingFileDb()) return mockDb.getMessages(conversationId, after);
const { rows } = await query<{
    id: string; conversation_id: string; sender_id: string;
    content: string; sent_at: string; read_by: string[];
  }>(
    after
      ? `SELECT * FROM messages WHERE conversation_id = $1 AND sent_at > $2 ORDER BY sent_at ASC`
      : `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sent_at ASC LIMIT 100`,
    after ? [conversationId, after] : [conversationId]
  );
  return rows;
}

export async function createMessage(
  id: string, conversationId: string, senderId: string, content: string
) {
    if (usingFileDb()) return mockDb.createMessage(id, conversationId, senderId, content);
const now = new Date().toISOString();
  await Promise.all([
    query(
      `INSERT INTO messages (id, conversation_id, sender_id, content, sent_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, conversationId, senderId, content, now]
    ),
    query(
      `UPDATE conversations SET last_message_at = $1 WHERE id = $2`,
      [now, conversationId]
    ),
  ]);
  return { id, conversationId, senderId, content, sentAt: now, readBy: [] };
}

export async function markMessagesRead(conversationId: string, userId: string) {
    if (usingFileDb()) return mockDb.markMessagesRead(conversationId, userId);
await query(
    `UPDATE messages SET read_by = read_by || $1::jsonb
     WHERE conversation_id = $2 AND NOT (read_by @> $1::jsonb) AND sender_id != $3`,
    [JSON.stringify([userId]), conversationId, userId]
  );
}

// ── Staff Management ──────────────────────────────────────────────────────────
export async function listStaffUsers() {
    if (usingFileDb()) return mockDb.listStaffUsers();
const { rows } = await query<{ id: string; data: any }>(
    `SELECT id, data FROM users WHERE data->>'role' != 'customer' ORDER BY data->>'fullName'`
  );
  return rows.map(r => {
    // Strip sensitive fields before returning
    const { passwordHash, securityAnswerHash, ...safe } = r.data;
    return safe;
  });
}

export async function createStaffUser(staffData: Record<string, any>) {
    if (usingFileDb()) return mockDb.createStaffUser(staffData as StoredUser);
await query(
    'INSERT INTO users (id, data) VALUES ($1, $2)',
    [staffData.id, staffData]
  );
}

export async function updateStaffUser(id: string, patch: Record<string, any>) {
    if (usingFileDb()) return mockDb.updateStaffUser(id, patch);
const { rows } = await query<{ data: any }>(
    'SELECT data FROM users WHERE id = $1',
    [id]
  );
  if (!rows.length) throw new Error('Staff user not found');
  const updated = { ...rows[0].data, ...patch };
  await query('UPDATE users SET data = $1 WHERE id = $2', [updated, id]);
  const { passwordHash, securityAnswerHash, ...safe } = updated;
  return safe;
}








