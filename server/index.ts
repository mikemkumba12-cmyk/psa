import { config } from './config';
import { createApp } from './app';
import { checkDatabase } from './db/pool';
import { pendingMigrations, runMigrations } from './database/migrate';
import { startBackgroundJobs } from './jobs';

async function main(): Promise<void> {
  const db = await checkDatabase();
  if (!db.ok) {
    console.error(`[api] Cannot reach PostgreSQL (${db.error}). Check DATABASE_URL or the PG* variables.`);
    process.exit(1);
  }

  if (process.env.MIGRATE_ON_START === 'true') {
    await runMigrations();
  } else {
    const pending = await pendingMigrations();
    if (pending.length) {
      console.error(`[api] ${pending.length} database migration(s) pending: ${pending.join(', ')}. Run "npm run migrate".`);
      process.exit(1);
    }
  }

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}`);
  });
  if (config.jobs.enabled) startBackgroundJobs();
}

main().catch(error => {
  console.error('[api] failed to start:', error);
  process.exit(1);
});
