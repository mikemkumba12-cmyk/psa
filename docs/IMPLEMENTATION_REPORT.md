# Implementation report

Date: 2026-10-25 · Branch: `asante-branch`

This report covers the audit of the existing application, the changes made, how they were verified, and what remains open. Statuses are only marked "implemented and verified" where an automated test or a recorded browser check exercised the behaviour.

---

## 1. Original problems and root causes

| Area | What was found | Root cause |
|---|---|---|
| **Data storage** | Records "disappeared" or differed between sessions. | Two conflicting schemas: migration `001` created relational tables while the server's `ensureSchema()` expected `(id, data JSONB)` tables with the same names. Any failing query silently switched the server to a JSON file for the rest of its life. The browser additionally treated `localStorage` (seeded with demo data) as the primary store and fell back to it whenever the API failed. |
| **Fake data** | Every new customer saw loans, repayments and a business they never applied for. | Registration called `generateUserMockBundle()` and saved the invented records. |
| **Document upload** | ID documents uploaded at registration never reached officers. | The registration page only set a "uploaded" flag; the file was never sent. `/api/documents/upload` wrote the file to disk as `.bin` but created **no database record**, so no profile could list it; download only looked in the requester's own folder, so officers could never open it; there was no type or size validation. SME business documents saved only the file name. |
| **Authorization** | Any signed-in customer could list every customer, application and document. | Most `/api/*` routes checked only that a user was signed in. Role checks used role names only; the `roles`/`permissions` tables were unused. Audit entries trusted `X-Actor-*` headers sent by the browser. Tokens were accepted in query strings; hard-coded fallback secrets; CORS allowed any origin; the scenario endpoint required no sign-in. SME businesses could be marked "Verified" with risk "Low" by their owners. |
| **Login** | The browser could "sign in" without the server. | `authService.login` fell back to demo accounts stored in `localStorage` with browser-side SHA-256 hashing. |
| **AI** | Gemini key exposed; prompts editable by users. | `VITE_GEMINI_API_KEY` was compiled into the web bundle; the system prompt was built in the browser and sent to the API. "AI" scores elsewhere were rule-based code running on demo data in the browser. |
| **Settings** | Biometric login was a disabled stub; password change did not sign out other sessions. | `biometricEnabled = false // Stub`; tokens were stateless with no revocation. |
| **SME** | Clients were shown other clients' businesses; financing requests went nowhere. | When no business matched, the page showed "John Doe"'s or the first business in the list; generated businesses were linked to `cust-<id>` while the page looked for `<id>`. Financing requests were stored inside the business JSON and never became applications. Risk and health scores were computed in the client's browser from self-declared revenue. |
| **Mobile** | Horizontal scrolling on the loan form and elsewhere. | Fixed widths (e.g. `w-[280px]`), many-column grids without responsive breakpoints, and wide tables. |
| **Reporting / "big data"** | Dashboards did not reflect reality. | Figures computed in the browser from demo arrays; a "scenario switcher" returned hard-coded percentages; server summary loaded all rows into memory and assumed 10% interest. No ETL, snapshots or data-quality checks existed. Payroll batches and AI decision history lived in process memory. |
| **Deployment** | Documents would be lost on redeploy; secrets in source. | No volume for uploaded files; database password and JWT secret hard-coded in `docker-compose.yml`; PM2 cluster mode incompatible with in-process state. |
| **Documentation** | Reports claimed "97/100 — production ready". | Generated reports were not checked against the code. They are now in `docs/archive/` with a warning. |

## 2. What was implemented

### Architecture

- **PostgreSQL is the only store.** The file-backed mock database, browser `localStorage` stores, demo data files and all fallbacks were removed. The API refuses to start if the database is unreachable or migrations are pending.
- **Server restructured into modules** (`server/modules/*`) with shared auth, access-control, validation (zod), audit and HTTP helpers. The 1,500-line `server/index.ts` and the duplicate `/api/v1` routes were replaced.
- **Web app rebuilt on the real API** with a shared design system (`src/ui`), consistent statuses, loading/empty/error states, accessible dialogs and forms, and tables that become cards on phones.

### Feature status

| Feature | Status | Evidence |
|---|---|---|
| Registration with real ID upload linked to the customer record | Implemented and verified | `auth.test.ts`, `documents.test.ts`; browser upload at 320 px |
| Document storage: content-type detection, size limit, checksum, private storage, preview/download with authorization, review (verify/reject with reason), replacement history, soft delete, expiry, audit of uploads/views/downloads | Implemented and verified | `documents.test.ts` (10 tests); browser preview |
| Optional encryption at rest (AES-256-GCM) | Implemented and verified (off by default) | `storage.test.ts` |
| Server-side sessions, logout, deactivation takes effect immediately, lockout after failed sign-ins, password strength (one rule set in `shared/passwordPolicy.ts` used by both the web app's live checklist and the API), show/hide toggle on every password field, password change signs out other devices, reset tokens in DB, session list/revoke | Implemented and verified | `auth.test.ts` (12 tests); browser check of registration after a rejected password |
| Passkeys (WebAuthn) for fingerprint/face/PIN sign-in | Implemented, partially verified | Option generation, single-use challenges and rejection of forged/unknown credentials are tested. A full ceremony with a real authenticator was not possible in this environment. |
| Administrator-controlled permissions: role defaults + per-person grants/denials, product assignments, approval limits, no self-escalation, last-admin protection, temporary passwords, audit diff | Implemented and verified | `workflow.test.ts`; browser check of the editor |
| Record-level access (customers see only their own records; officers only their products/assignments) | Implemented and verified | `documents.test.ts`, `workflow.test.ts` |
| Configurable loan products (limits, terms, interest method, rate, fees, frequency, documents, members-only, collateral, effective dates); cannot activate without rate + institutional confirmation | Implemented and verified | `workflow.test.ts` |
| Pinnacle catalogue from pinnacle.co.mw seeded as **draft** products | Implemented | Migration `007` (no rates or fees were published, so none were invented) |
| Member register (staff-verified), customer member-number claims stay pending, configurable eligibility policy | Implemented and verified | `workflow.test.ts` |
| SME business profiles: owners/directors/beneficial owners/representatives/guarantors, duplicate prevention, financials with applicant vs verified provenance, business and party verification, representative authorisation | Implemented and verified | `workflow.test.ts` |
| One application pipeline for individuals and businesses: draft → submit (product limits, membership, required documents, declared figures) → assign (product-authorised officers only) → assess → recommend → approve within limit / reject / request info → offer → accept/decline → disbursement → repayments → closed | Implemented and verified | `workflow.test.ts` runs an SME loan end to end; browser approval |
| Explainable assessment (DSR, DSCR, net cash flow, installment ÷ revenue, trading history, concentration, proceeds coverage, scenarios) with every figure labelled verified / applicant / estimated; never decides | Implemented and verified | `workflow.test.ts` |
| Separation of duties (assessor/recommender cannot approve) and maker-checker for money movements (recorder cannot confirm); disbursement must equal net of deducted fees; repayments cannot exceed balance | Implemented and verified | `workflow.test.ts` |
| Repayment schedule from the actual disbursement date; allocation to oldest installments; arrears and days past due | Implemented and verified | `workflow.test.ts`, `services.test.ts`, `loanMath.test.ts` |
| Payroll deduction upload → matched rows become repayments awaiting confirmation | Implemented and verified | `services.test.ts` |
| Assistant without Gemini (rules + product configuration + approved knowledge search, citations, refusals, fallback, masked logs, optional self-hosted model limited to re-wording) | Implemented and verified | `services.test.ts` (6 assistant tests); see `ASSISTANT.md` |
| Reports from SQL: pipeline, approval rate, turnaround, disbursed/collected, outstanding, arrears, PAR30, collection rate, monthly trends, by product, SME queues/sectors, history snapshots, data-quality checks, audited CSV export | Implemented and verified | `services.test.ts` asserts figures equal underlying rows; see `ANALYTICS.md` |
| Notifications (in-app always; email/SMS only when configured and opted in; settings show whether channels are configured) | Implemented; external delivery not verified | Providers are not configured in this environment |
| Secure messaging between customers and staff | Implemented and verified | `services.test.ts` |
| Append-only audit log with viewer | Implemented and verified | `auth.test.ts` |
| Institution settings (membership policy, assessment thresholds, workflow, branding) | Implemented | Audited on change |
| Responsive UI at 320/375/390/768/1280 px | Verified for the screens listed in §5 | Scripted overflow checks + screenshots |
| Backups (database + files + manifest) and restore | Implemented and verified locally | See `OPERATIONS.md` |
| Customer CSV import | Implemented | Server validates every row |
| Staff-created applications on a customer's behalf | API implemented; no dedicated screen | — |

### Removed (were built on demo data, not real functionality)

- Employer risk predictions, top-up opportunity lists, officer quality scorecard, "fraud flags", segment insights and the browser "intelligence engine" — they computed over `localStorage` demo arrays. They can be rebuilt as SQL reports once real data exists.
- The "scenario switcher" with hard-coded portfolio percentages.
- The customer "Pay installment" button (it marked installments paid in the browser without any payment). Repayments are now recorded by staff and confirmed by a second person.
- Browser-side Gemini chat and `@google/genai`.
- Marketing-page testimonials (they were not real reviews).

## 3. Files

- **Server (new):** `server/app.ts`, `config.ts`, `jobs.ts`, `db/pool.ts`, `auth/*`, `lib/*`, `storage/index.ts`, `modules/**`, `database/seed/demo.ts`, `types/express.d.ts`, `tests/*` (6 files).
- **Server (rewritten):** `server/index.ts`, `database/migrate.ts`.
- **Server (removed):** `db.ts`, `mockDb.ts`, `repositories/`, `services/`, `routes/api/v1/`, `middleware/`, old tests, `database/seed/001_seed_malawi_data.sql` (contained invalid password hashes).
- **Web (new):** `src/api`, `src/ui`, `src/features`, `src/pages/{public,client,staff}`, `src/layouts/PortalLayout.tsx`, `src/lib/{format,useResource,branding}.ts`.
- **Web (removed):** `src/components/*`, `src/context/*`, `src/mock/*`, `src/data.ts`, `src/types.ts`, old pages/layouts, `src/lib/{store,dataService,platformApi,apiClient,intelligenceEngine,mockDataGenerator,aiAdvisorService,aiTransparency,documentExtractionService,auditTrail}.ts`, `src/auth/authService.ts`.
- **Other:** `scripts/{run-tests.mjs,backup.ts,create-admin.ts}`, `Dockerfile`, `docker-compose.yml`, `ecosystem.config.js`, `.env.example`, `.github/workflows/ci.yml`, `vite.config.ts` (API proxy), `index.html`, docs. Sample payroll file moved to `samples/`; helper scripts that generated demo files removed.

## 4. Database migrations

All migrations run in a transaction, extend the existing schema rather than replacing it, and have a `.down.sql`. Each was applied, rolled back and re-applied on a clean database.

| Migration | Contents |
|---|---|
| `002_auth_audit_and_settings` | Role alignment (`officer` → `loan_officer`), user security columns, customer profile columns (removes invented risk defaults), unique national ID, sessions, password-reset tokens, WebAuthn credentials and challenges, append-only audit trigger and indexes, notifications, conversations/messages, `app_settings` |
| `003_documents` | Document types; reshapes the existing `documents` table (owner links, checksum, storage key, encryption flag, review status, expiry, replacement, soft delete); deleting a user no longer deletes their documents |
| `004_permissions_and_products` | Permission catalogue, role defaults, per-user grants/denials, `loan_products` with activation constraint, staff product assignments |
| `005_members_and_businesses` | Member register, businesses, business parties, business financials with provenance |
| `006_application_workflow` | Extends `loan_applications` (removes invented defaults such as 3.5% rate, score 70, 25% DTI), status history, assessments, offers, maker-checker `loan_transactions`, payroll links |
| `007_product_catalogue_and_branding` | Pinnacle's published products as drafts; public contact details |
| `008_knowledge_base_and_analytics` | Knowledge documents/chunks with full-text index, assistant logs, portfolio snapshots, analytics indexes |

No existing data was deleted. The working database on this machine contained no prior data (fresh clone); development and test databases were created locally.

## 5. Tests and checks

- `npm run lint` (TypeScript, frontend + API): **pass**
- `npm run build`: **pass**
- `npm test`: **53 tests in 6 files, all passing** — auth (12), documents (10), loan maths (8), services: assistant/reports/payroll/messages/passkeys/audit (11), storage encryption (2), workflow: products/permissions/SME end-to-end/individual (10)
- `npm audit --omit=dev`: **0 vulnerabilities** (zod upgraded to 4.6.7; vite patched via `npm audit fix`)
- Migrations: applied to a clean database, each rolled back and re-applied
- Backup and restore: verified locally (counts matched)
- Browser checks (Vite + API, demo data):
  - No horizontal overflow at **320 px**: landing, sign-in, customer home, **loan application form** (with live estimate), application detail, business detail, documents, settings
  - No overflow at **375 px**: staff overview, applications list and review, customers, members, businesses, transactions, reports, payroll, audit, messages, assistant, account settings
  - No overflow at **768 px**: staff & permissions, products, knowledge, institution settings, reports
  - **390 px**: registration; **1280 px**: reports, permissions editor
  - Through the UI: real ID upload → listed as awaiting review → secure preview; manager approval of a recommended application
  - No failed (5xx) API calls during the staff sweep

Not covered by automated tests: frontend component tests, cross-browser testing on physical phones, a full passkey ceremony with a real device, email/SMS delivery, load testing on production-sized data.

## 6. Dependencies

| Added | Why |
|---|---|
| `zod` | Input validation for every API endpoint with field-level error messages |
| `multer` | Streaming multipart uploads (replaces base64-in-JSON, which inflated files by a third) |
| `@simplewebauthn/server`, `@simplewebauthn/browser` | Passkey verification; hand-written WebAuthn parsing would be error-prone |
| `@types/react`, `@types/react-dom` (dev), `@types/multer` (dev) | Types previously arrived indirectly through an outdated package |

Removed: `@google/genai`, `@types/react-router-dom` (v5 types for a v7 library).

## 7. Configuration and manual setup still required

- **Hosting:** not chosen. Provide PostgreSQL, a persistent volume for documents, HTTPS, and the environment variables in `.env.example` / `OPERATIONS.md`.
- **First administrator:** `npm run create-admin -- "Name" email`.
- **Loan products:** an administrator must enter Pinnacle's approved rates and fees and confirm each product's terms before it is offered.
- **Policies awaiting confirmation by Pinnacle** (flagged in the UI as placeholders):
  - Membership: minimum membership period, verification requirement, owner/director rule, representative authorisation.
  - Assessment thresholds: debt service ratio, debt service coverage, installment ÷ revenue, minimum trading period, customer concentration.
  - Document requirements per product.
- **Knowledge base:** replace the three seeded public-website summaries with Pinnacle's approved policies, product sheets and FAQs.
- **Branding:** the logo is a placeholder; supply official assets. Operating under the Pinnacle name requires Pinnacle's authorisation.
- **Optional:** `DOCUMENT_ENCRYPTION_KEY`, SendGrid / Africa's Talking credentials, an Ollama endpoint.

## 8. Big data: conclusion

The original application **did not have big-data capability**: figures were computed in the browser from demo arrays, some were hard-coded, and nothing persisted reliably. It now has correct, testable operational reporting in PostgreSQL with indexes, daily snapshots, data-quality checks and exports. At the expected scale of a Malawian MFI, distributed infrastructure (Kafka, Spark, a warehouse) is not justified; `ANALYTICS.md` sets out when to revisit that decision based on measured query times.

## 9. Risks before production

1. **No malware scanning** of uploaded files. Content-type detection blocks executables disguised as PDFs/images, but a scanner (e.g. ClamAV) should be added before accepting public uploads at scale.
2. **Password reset uses a security question**; an email/SMS reset link needs a configured provider.
3. **Single API instance only**: rate limiting and background jobs are in-process.
4. **Policies and product terms unconfirmed** (see §7). Until confirmed, eligibility and risk indicators reflect placeholder values.
5. **No late-payment penalties or interest recalculation on early repayment**; schedules are fixed at disbursement.
6. **No integration with bank/mobile-money/payroll systems**; money movements are recorded manually with maker-checker confirmation.
7. **Document retention/purge policy not implemented**; deleted files are retained.
8. **Passkeys and notifications not tested end-to-end on real devices/providers.**
9. **No frontend automated tests**; UI behaviour was checked manually in a browser.
10. **Legacy tables from migration 001** (`repayments`, `decision_history`, `intelligence_scores`, `customer_events`, `document_extractions`) are unused and can be dropped once confirmed unnecessary.
11. **Restore drill** on the target infrastructure has not been performed.

This system should not be described as production-ready until items 1–4 and 11 are addressed and the policies in §7 are confirmed.
