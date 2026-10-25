import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { checkDatabase } from './db/pool';
import { errorMiddleware, notFound } from './lib/http';
import { requireAuth } from './auth/middleware';
import { authRouter } from './modules/auth/auth.routes';
import { documentsRouter } from './modules/documents/documents.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { staffRouter } from './modules/staff/staff.routes';
import { productsRouter, publicProductsRouter } from './modules/products/products.routes';
import { publicSettingsRouter, settingsRouter } from './modules/settings/settings';
import { customersRouter } from './modules/customers/customers.routes';
import { membersRouter } from './modules/members/members.routes';
import { businessesRouter } from './modules/businesses/businesses.routes';
import { applicationsRouter } from './modules/applications/applications.routes';
import { transactionsRouter } from './modules/applications/transactions.routes';
import { passkeysRouter } from './modules/auth/passkeys.routes';
import { assistantRouter } from './modules/assistant/assistant';
import { knowledgeRouter } from './modules/assistant/knowledge';
import { reportsRouter } from './modules/reports/reports';
import { messagesRouter } from './modules/messages/messages.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { payrollRouter } from './modules/payroll/payroll.routes';

/** Builds the Express application. Kept separate from listen() so tests can start it on any port. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

  app.use(securityHeaders);
  app.use(cors);
  app.use(express.json({ limit: '1mb' }));

  // ── Public ─────────────────────────────────────────────────────────────────
  app.get('/api/health', async (_req, res) => {
    const db = await checkDatabase();
    res.status(db.ok ? 200 : 503).json({ status: db.ok ? 'ok' : 'degraded', database: db.ok ? 'connected' : 'unavailable' });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/auth', passkeysRouter);
  app.use('/api/public', publicSettingsRouter);
  app.use('/api/public', publicProductsRouter);

  // ── Authenticated ──────────────────────────────────────────────────────────
  app.use('/api', requireAuth);
  for (const router of [
    documentsRouter, notificationsRouter, staffRouter, productsRouter, settingsRouter, customersRouter,
    membersRouter, businessesRouter, applicationsRouter, transactionsRouter, assistantRouter, knowledgeRouter,
    reportsRouter, messagesRouter, auditRouter, payrollRouter,
  ]) {
    app.use('/api', router);
  }

  app.use('/api', (_req, _res, next) => next(notFound('No such API endpoint.')));

  if (config.serveFrontend) {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath, { index: false }));
      app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
    }
  }

  app.use(errorMiddleware);
  return app;
}

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/**
 * Cross-origin requests are only allowed from origins listed in APP_URL.
 * In development the Vite dev server proxies /api, so requests are same-origin.
 */
function cors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.header('Origin');
  if (origin && config.cors.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}
