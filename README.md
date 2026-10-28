# Pinnacle Financial Services — Lending Platform

Customer and staff portal for Pinnacle Financial Services: loan applications for salaried individuals and members' businesses (SMEs), private document management, staff permissions, maker-checker transactions, reporting, and a governed assistant.

- **Frontend:** React 19, React Router 7, Tailwind CSS 4, Vite
- **API:** Node.js + Express 4 (TypeScript, run with `tsx`)
- **Database:** PostgreSQL 14+ (the only data store; there is no file or browser-storage fallback)
- **Documents:** private storage behind a driver interface (local filesystem today), optional AES-256-GCM encryption at rest

See [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md) for the audit, what changed, test evidence and open risks.

## Quick start (development)

Requirements: Node.js 20+, PostgreSQL 14+.

```bash
npm ci
cp .env.example .env          # then set PGPASSWORD etc. if your Postgres needs them
createdb pinaco && createdb pinaco_test
npm run migrate
npm run seed:demo             # optional: demo staff, customers and products (marked as demo data)
npm run api                   # API on http://localhost:4000
npm run dev                   # web app on http://localhost:3000 (proxies /api to the API)
```

`seed:demo` writes randomly generated demo passwords to `.local/demo-credentials.txt` (git-ignored). Demo records are labelled "Demo" throughout the UI and can be excluded from reports.

The real Pinnacle product catalogue (from pinnacle.co.mw) is created as **draft** products. They cannot be offered until an administrator enters the approved interest rate and fees and confirms the terms (Staff portal → Loan products).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server for the web app |
| `npm run api` | API with auto-reload |
| `npm start` | API (production; set `NODE_ENV=production`, `SERVE_FRONTEND=true` to serve `dist/`) |
| `npm run build` | Build the web app into `dist/` |
| `npm run lint` | TypeScript type check (frontend + API) |
| `npm test` | API integration and unit tests against the `pinaco_test` database (its tables are dropped on each run) |
| `npm run migrate` / `migrate:status` / `migrate:rollback` | Apply, list or revert SQL migrations |
| `npm run migrate:reset -- --yes-delete-all-data` | Drop everything (refused in production) |
| `npm run seed:demo` | Demo data through the real API |
| `npm run backup` | Database dump + document files into `BACKUP_DIR` |
| `npm run create-admin -- "Name" email` | Create the first administrator (one-time password) |

## Project layout

```
server/
  app.ts, index.ts, config.ts, jobs.ts
  auth/            tokens, sessions, passwords, permissions, record-level access
  db/pool.ts       PostgreSQL access (no fallback store)
  database/        migrations (NNN_*.sql + .down.sql), migration runner, demo seed
  lib/             HTTP helpers, audit log, loan maths, rate limiting
  modules/         auth, documents, staff, products, customers, members, businesses,
                   applications (+ assessment, transactions), payroll, reports,
                   assistant (+ knowledge base), messages, notifications, settings, audit
  storage/         private document storage driver + encryption
  tests/           node:test suites (run by scripts/run-tests.mjs)
src/
  api/             API client and response types
  ui/              shared design system (buttons, forms, tables, dialogs, status badges)
  features/        documents, applications, businesses, messages, assistant, account
  pages/           public, client and staff screens
docs/              implementation report, operations, assistant, analytics; archive/ = old prototype docs
```

## Roles and permissions

Roles (`loan_officer`, `manager`, `executive`, `admin`) give default permissions; administrators grant or remove individual permissions, assign the loan products each person may work on, and set approval limits (Staff portal → Staff & permissions). Every rule is enforced by the API — hiding a button is never the only control. Changes apply on the person's next request.

## Further reading

- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — deployment, environment variables, document storage, backups and restore
- [`docs/ASSISTANT.md`](docs/ASSISTANT.md) — how the assistant answers, its rules, and how to add knowledge
- [`docs/ANALYTICS.md`](docs/ANALYTICS.md) — reporting design and the big-data assessment
