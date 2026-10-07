import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export interface MigrationStatus {
  filename: string;
  applied: boolean;
  appliedAt?: string;
}

export async function getDbPool(): Promise<Pool | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }
  return new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
}

export async function ensureMigrationTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function runMigrations(): Promise<void> {
  const pool = await getDbPool();
  if (!pool) {
    console.log('[Migration] DATABASE_URL not configured — skipping PostgreSQL migration (Dual-mode fallback active).');
    return;
  }

  try {
    await ensureMigrationTable(pool);
    const migrationsDir = path.join(process.cwd(), 'server', 'database', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[Migration] No migrations directory found.');
      return;
    }

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    const { rows: appliedRows } = await pool.query('SELECT filename FROM schema_migrations');
    const appliedSet = new Set(appliedRows.map((r: { filename: string }) => r.filename));

    for (const file of files) {
      if (!appliedSet.has(file)) {
        console.log(`[Migration] Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');
        
        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`[Migration] Successfully applied: ${file}`);
      }
    }
  } catch (error) {
    console.error('[Migration] Error running SQL migrations:', error);
  } finally {
    await pool.end();
  }
}

export async function checkMigrationStatus(): Promise<MigrationStatus[]> {
  const pool = await getDbPool();
  if (!pool) {
    console.log('[Migration Status] No DATABASE_URL configured.');
    return [];
  }

  try {
    await ensureMigrationTable(pool);
    const migrationsDir = path.join(process.cwd(), 'server', 'database', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    const { rows: appliedRows } = await pool.query('SELECT filename, applied_at FROM schema_migrations');
    const appliedMap = new Map<string, string>(appliedRows.map((r: { filename: string; applied_at: Date }) => [r.filename, r.applied_at.toISOString()]));

    return files.map(filename => ({
      filename,
      applied: appliedMap.has(filename),
      appliedAt: appliedMap.get(filename) as string | undefined,
    }));
  } finally {
    await pool.end();
  }
}

export async function rollbackLastMigration(): Promise<void> {
  const pool = await getDbPool();
  if (!pool) return;
  try {
    await ensureMigrationTable(pool);
    const { rows } = await pool.query('SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1');
    if (rows.length === 0) {
      console.log('[Rollback] No applied migrations to rollback.');
      return;
    }
    const lastFile = rows[0].filename;
    console.log(`[Rollback] Rolling back migration record: ${lastFile}`);
    await pool.query('DELETE FROM schema_migrations WHERE filename = $1', [lastFile]);
    console.log(`[Rollback] Rollback completed for ${lastFile}`);
  } finally {
    await pool.end();
  }
}

// CLI Execution Handler
if (process.argv[1] && process.argv[1].includes('migrate.ts')) {
  const cmd = process.argv[2] || 'up';
  if (cmd === 'up') {
    runMigrations().then(() => process.exit(0));
  } else if (cmd === 'status') {
    checkMigrationStatus().then(statuses => {
      console.table(statuses);
      process.exit(0);
    });
  } else if (cmd === 'rollback') {
    rollbackLastMigration().then(() => process.exit(0));
  }
}

