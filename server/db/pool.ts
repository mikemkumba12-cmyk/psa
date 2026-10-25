import pg from 'pg';
import { config } from '../config';

/**
 * PostgreSQL is the only source of truth. There is intentionally no file or
 * in-memory fallback: if the database is unavailable, requests fail loudly
 * instead of silently writing somewhere else.
 */

// NUMERIC values come back as strings by default; amounts in this system fit in a JS number.
pg.types.setTypeParser(1700, value => (value === null ? null : Number(value)));
// BIGINT (count(*)) -> number
pg.types.setTypeParser(20, value => (value === null ? null : Number(value)));
// DATE -> plain 'YYYY-MM-DD' string, never shifted by timezone
pg.types.setTypeParser(1082, value => value);

export const pool = new pg.Pool({
  connectionString: config.database.url,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
  max: config.database.poolMax,
});

pool.on('error', error => {
  console.error('[db] Idle client error:', error.message);
});

export type Queryable = Pick<pg.PoolClient, 'query'>;

export async function query<T = any>(
  text: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<pg.QueryResult<T & pg.QueryResultRow>> {
  return client.query<T & pg.QueryResultRow>(text, params);
}

export async function one<T = any>(
  text: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<T | null> {
  const result = await client.query(text, params);
  return (result.rows[0] as T) ?? null;
}

export async function many<T = any>(
  text: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<T[]> {
  const result = await client.query(text, params);
  return result.rows as T[];
}

/** Runs `work` inside a transaction and commits only if it resolves. */
export async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Database unreachable' };
  }
}
