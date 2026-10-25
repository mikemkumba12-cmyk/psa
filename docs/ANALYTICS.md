# Analytics and the "big data" assessment

## What existed

- Dashboards computed figures **in the browser** from arrays in `localStorage` that were seeded with hard-coded demo records (`src/data.ts`, `src/mock/*`), plus a "scenario switcher" that returned fixed numbers ("Healthy Portfolio: 96.5% portfolio health").
- The server's `/api/dashboard/summary` loaded every application into memory and estimated interest earned as a flat 10% of disbursed amounts.
- Every new registration generated fictitious loans, repayments and a business for that user, so even "real" figures included invented records.
- There was no ETL, warehouse, background processing, data-quality monitoring or historical snapshotting. Payroll batches and AI decision history were held in process memory and lost on restart.

**Conclusion: the application did not have big-data capability.** It had charts.

## What exists now

All reporting is SQL over the transactional tables (`server/modules/reports/reports.ts`):

- **Pipeline:** applications by status and amount.
- **Decisions:** approval rate, average and median days from submission to decision.
- **Flows:** confirmed disbursements and repayments in a date range (from maker-checker transactions only).
- **Portfolio:** active loans, outstanding principal and total, arrears, loans in arrears, PAR30 — computed from the repayment schedule and confirmed payments.
- **Collection rate:** amount paid ÷ amount due for installments that fell due in the period.
- **Monthly trends:** submissions, approvals, rejections, disbursed and collected amounts.
- **By product** and **SME** reports (verification/assessment/approval queues, sector breakdown, turnaround, SME PAR30).
- **History:** a background job writes a daily `portfolio_snapshots` row per product so trend reports do not recompute history.
- **Data quality:** consistency checks and table volumes.
- **CSV export** (applications, transactions, portfolio) for users with `reports.export`; exports are audited and spreadsheet-formula injection is neutralised.

Every report says how much demo data it contains and can exclude it. Definitions are shown with the figures.

Indexes were added for the access paths these queries use (status, product, officer, submission/decision dates, confirmed transactions by date, installments by due date).

## Is a big-data stack justified?

No, not at this stage. The decision should be based on measured volume:

- A microfinance institution of this kind will have thousands to low hundreds of thousands of loans and a few million schedule/transaction rows over many years. PostgreSQL with appropriate indexes aggregates this in milliseconds to low seconds.
- The current local database (demo data) is a few MB; there is no production data to measure yet.
- Kafka, Spark or a separate warehouse would add operating cost and failure modes without a workload that needs them.

**When to revisit:** if report queries over production data exceed a few seconds, add materialised views refreshed by the existing job runner; if analytics load starts affecting transaction latency, move reporting to a read replica; only beyond that consider a separate analytical store.

## Tests

`server/tests/services.test.ts` creates a loan through the real workflow, confirms a disbursement, lets installments fall overdue, and asserts that outstanding principal, outstanding total, arrears, PAR30, disbursed amount, approval counts and the snapshot history match the underlying rows exactly.
