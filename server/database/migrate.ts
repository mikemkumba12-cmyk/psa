import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { config } from '../config';

/**
 * SQL migration runner.
 *
 *  - Files named NNN_description.sql in ./migrations are applied in order.
 *  - Each file runs in its own transaction, so a failure leaves the database untouched.
 *  - An optional NNN_description.down.sql file reverses a migration for `rollback`.
 */

export interface MigrationStatus {
  filename: string;
  applied: boolean;
  appliedAt?: string;
  reversible: boolean;
}

const migrationsDir = path.join(process.cwd(), 'server', 'database', 'migrations');

function createClient(): pg.Client {
  return new pg.Client({
    connectionString: config.database.url,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
  });
}

function listMigrationFiles(): string[] {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql') && !file.endsWith('.down.sql'))
    .sort();
}

function downFileFor(file: string): string {
  return path.join(migrationsDir, file.replace(/\.sql$/, '.down.sql'));
}

async function ensureMigrationTable(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function runMigrations(options: { quiet?: boolean } = {}): Promise<string[]> {
  const log = options.quiet ? () => undefined : console.log;
  const client = createClient();
  await client.connect();
  const applied: string[] = [];
  try {
    await ensureMigrationTable(client);
    const { rows } = await client.query<{ filename: string }>('SELECT filename FROM schema_migrations');
    const done = new Set(rows.map(row => row.filename));

    for (const file of listMigrationFiles()) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      log(`[migrate] applying ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (error: any) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed and was rolled back: ${error?.message || error}`);
      }
    }
    log(applied.length ? `[migrate] applied ${applied.length} migration(s)` : '[migrate] database is up to date');
    return applied;
  } finally {
    await client.end();
  }
}

export async function checkMigrationStatus(): Promise<MigrationStatus[]> {
  const client = createClient();
  await client.connect();
  try {
    await ensureMigrationTable(client);
    const { rows } = await client.query<{ filename: string; applied_at: Date }>(
      'SELECT filename, applied_at FROM schema_migrations',
    );
    const appliedAt = new Map<string, string>(rows.map(row => [row.filename, row.applied_at.toISOString()]));
    return listMigrationFiles().map(filename => ({
      filename,
      applied: appliedAt.has(filename),
      appliedAt: appliedAt.get(filename),
      reversible: fs.existsSync(downFileFor(filename)),
    }));
  } finally {
    await client.end();
  }
}

export async function pendingMigrations(): Promise<string[]> {
  const statuses = await checkMigrationStatus();
  return statuses.filter(status => !status.applied).map(status => status.filename);
}

export async function rollbackLastMigration(): Promise<void> {
  const client = createClient();
  await client.connect();
  try {
    await ensureMigrationTable(client);
    const { rows } = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1',
    );
    if (!rows.length) {
      console.log('[rollback] no applied migrations');
      return;
    }
    const file = rows[0].filename;
    const downFile = downFileFor(file);
    if (!fs.existsSync(downFile)) {
      throw new Error(`${file} has no .down.sql file, so it cannot be rolled back automatically.`);
    }
    await client.query('BEGIN');
    try {
      await client.query(fs.readFileSync(downFile, 'utf-8'));
      await client.query('DELETE FROM schema_migrations WHERE filename = $1', [file]);
      await client.query('COMMIT');
      console.log(`[rollback] reverted ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

/**
 * Drops every table in the public schema. Refuses to run in production and
 * requires an explicit confirmation flag, because it permanently deletes data.
 */
export async function resetDatabase(confirmed: boolean): Promise<void> {
  if (config.isProduction) throw new Error('Refusing to reset a production database.');
  if (!confirmed) {
    throw new Error('Reset permanently deletes all data. Re-run with --yes-delete-all-data to confirm.');
  }
  const client = createClient();
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('[reset] all tables dropped; run "npm run migrate" to recreate them');
  } finally {
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].includes('migrate.ts')) {
  const command = process.argv[2] || 'up';
  const run = async () => {
    if (command === 'up') await runMigrations();
    else if (command === 'status') console.table(await checkMigrationStatus());
    else if (command === 'rollback') await rollbackLastMigration();
    else if (command === 'reset') await resetDatabase(process.argv.includes('--yes-delete-all-data'));
    else throw new Error(`Unknown command "${command}". Use up, status, rollback or reset.`);
  };
  run().then(() => process.exit(0)).catch(error => {
    console.error(`[migrate] ${error.message}`);
    process.exit(1);
  });
}
