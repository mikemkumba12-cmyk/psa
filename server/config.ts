import 'dotenv/config';
import path from 'path';

/**
 * Central runtime configuration. Every environment-specific value is read here
 * so the rest of the server never touches process.env directly.
 */

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Environment variable ${name} must be a number.`);
  return value;
}

function readSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length >= 32) return value;
  if (isProduction) {
    throw new Error(`${name} must be set to a random string of at least 32 characters in production.`);
  }
  return devFallback;
}

function buildDatabaseUrl(): string {
  if (isTest && process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.PGHOST || 'localhost';
  const port = process.env.PGPORT || '5432';
  const database = isTest ? (process.env.PGDATABASE_TEST || 'pinaco_test') : (process.env.PGDATABASE || 'pinaco');
  const user = encodeURIComponent(process.env.PGUSER || 'postgres');
  const password = process.env.PGPASSWORD ? `:${encodeURIComponent(process.env.PGPASSWORD)}` : '';
  return `postgres://${user}${password}@${host}:${port}/${database}`;
}

function resolveFromCwd(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

export const config = {
  isProduction,
  isTest,
  port: readNumber('PORT', 4000),

  database: {
    url: buildDatabaseUrl(),
    ssl: process.env.PGSSLMODE === 'require',
    poolMax: readNumber('PG_POOL_MAX', 10),
  },

  auth: {
    secret: readSecret('AUTH_SECRET', 'local-development-only-auth-secret-do-not-deploy'),
    tokenTtlMs: readNumber('AUTH_TOKEN_TTL_HOURS', 12) * 60 * 60 * 1000,
    passwordResetTtlMs: readNumber('PASSWORD_RESET_TOKEN_TTL_MINUTES', 15) * 60 * 1000,
    bcryptRounds: readNumber('BCRYPT_ROUNDS', isTest ? 4 : 12),
    maxFailedLogins: readNumber('AUTH_MAX_FAILED_LOGINS', 5),
    lockoutMinutes: readNumber('AUTH_LOCKOUT_MINUTES', 15),
  },

  webauthn: {
    rpName: process.env.WEBAUTHN_RP_NAME || 'Pinnacle Financial Services',
    rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
    origins: (process.env.WEBAUTHN_ORIGINS || 'http://localhost:3000,http://localhost:4000')
      .split(',').map(item => item.trim()).filter(Boolean),
  },

  cors: {
    allowedOrigins: (process.env.APP_URL || '')
      .split(',').map(item => item.trim()).filter(item => item && item !== '*'),
  },

  documents: {
    driver: (process.env.DOCUMENT_STORAGE_DRIVER || 'local') as 'local',
    localDir: resolveFromCwd(process.env.DOCUMENT_STORAGE_DIR || (isTest ? '.local/test-documents' : '.local/documents')),
    maxBytes: readNumber('DOCUMENT_MAX_BYTES', 10 * 1024 * 1024),
    /** Optional base64-encoded 32-byte key. When set, files are encrypted with AES-256-GCM before storage. */
    encryptionKey: process.env.DOCUMENT_ENCRYPTION_KEY || '',
  },

  backups: {
    dir: resolveFromCwd(process.env.BACKUP_DIR || '.local/backups'),
    pgDumpPath: process.env.PG_DUMP_PATH || 'pg_dump',
  },

  assistant: {
    /** Optional self-hosted model endpoint (Ollama-compatible). Disabled when empty. */
    ollamaUrl: process.env.ASSISTANT_OLLAMA_URL || '',
    ollamaModel: process.env.ASSISTANT_OLLAMA_MODEL || '',
  },

  jobs: {
    enabled: !isTest && process.env.BACKGROUND_JOBS !== 'off',
    analyticsIntervalMinutes: readNumber('ANALYTICS_REFRESH_MINUTES', 30),
  },

  serveFrontend: isProduction || process.env.SERVE_FRONTEND === 'true',
};

export type AppConfig = typeof config;
