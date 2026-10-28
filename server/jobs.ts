import { query } from './db/pool';
import { config } from './config';
import { snapshotPortfolio } from './modules/reports/reports';
import { ensureKnowledgeIndexed } from './modules/assistant/knowledge';

/**
 * Periodic maintenance. Runs inside the API process; each job is idempotent so
 * running it twice (e.g. two instances) is harmless.
 */
const jobs: Array<{ name: string; intervalMs: number; run: () => Promise<unknown> }> = [
  {
    name: 'expire-auth-artifacts',
    intervalMs: 60 * 60 * 1000,
    run: async () => {
      await query('DELETE FROM auth_challenges WHERE expires_at < now()');
      await query('DELETE FROM password_reset_tokens WHERE expires_at < now() - interval \'1 day\'');
    },
  },
  {
    // Expired offers return the application to "approved" so a fresh offer can be issued.
    name: 'expire-offers',
    intervalMs: 15 * 60 * 1000,
    run: async () => {
      await query(
        `WITH expired AS (
           UPDATE loan_offers SET status = 'expired' WHERE status = 'issued' AND expires_at < now() RETURNING application_id
         ), moved AS (
           UPDATE loan_applications a SET status = 'approved', updated_at = now()
             FROM expired e WHERE a.id = e.application_id AND a.status = 'offer_issued' RETURNING a.id
         )
         INSERT INTO application_events (application_id, from_status, to_status, actor_role, note)
         SELECT id, 'offer_issued', 'approved', 'system', 'Offer expired without a response' FROM moved`,
      );
    },
  },
  {
    // Background aggregation keeps historical trend reports cheap regardless of portfolio size.
    name: 'portfolio-snapshot',
    intervalMs: config.jobs.analyticsIntervalMinutes * 60 * 1000,
    run: snapshotPortfolio,
  },
  {
    name: 'index-knowledge',
    intervalMs: 60 * 60 * 1000,
    run: ensureKnowledgeIndexed,
  },
];

export function registerJob(name: string, intervalMs: number, run: () => Promise<unknown>): void {
  jobs.push({ name, intervalMs, run });
}

export function startBackgroundJobs(): void {
  for (const job of jobs) {
    const execute = async () => {
      const started = Date.now();
      try {
        await job.run();
      } catch (error: any) {
        console.error(`[jobs] ${job.name} failed:`, error?.message || error);
        return;
      }
      if (Date.now() - started > 5000) console.log(`[jobs] ${job.name} took ${Date.now() - started}ms`);
    };
    setTimeout(execute, 5_000).unref();
    setInterval(execute, job.intervalMs).unref();
  }
}
