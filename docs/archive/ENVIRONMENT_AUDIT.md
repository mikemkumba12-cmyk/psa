# PINACO Smart Advisor — Environment Audit Report

**Date:** July 21, 2026  
**Auditor:** Antigravity AI Engine  
**Phase:** UAT & Production Deployment Preparation

---

## 1. Project Identity

| Field | Value |
|---|---|
| Application Name | PINACO Smart Advisor (react-example) |
| Version | 0.0.0 (recommend bumping to 1.0.0 for production) |
| Node.js Target | ≥ 20 (LTS) |
| Runtime Type | ESM (`"type": "module"`) |
| Framework | React 19 + Express 4 + Vite 6 |

---

## 2. Package.json Audit

**Scripts:**

| Script | Command | Status |
|---|---|---|
| `dev` | `vite --port=3000 --host=0.0.0.0` | ✅ Valid |
| `api` | `tsx server/index.ts` | ✅ Valid |
| `build` | `vite build` | ✅ Valid |
| `preview` | `vite preview` | ✅ Valid |
| `lint` | `tsc --noEmit` | ✅ Valid |
| `migrate` | `tsx server/database/migrate.ts up` | ✅ Valid |
| `migrate:status` | `tsx server/database/migrate.ts status` | ✅ Valid |
| `migrate:rollback` | `tsx server/database/migrate.ts rollback` | ✅ Valid |
| `test` | `tsx server/tests/runner.ts` | ✅ Valid |

**Issue Found — Missing `start` script for production:**  
The `package.json` has no `start` script. The Dockerfile runs `npm run api` which executes `tsx server/index.ts` — this works for development but is not suitable for production (tsx is a dev transpiler, not a production runner).

> **Recommendation**: Add a compiled `start` script:
> ```json
> "start": "node --experimental-vm-modules dist/server/index.js"
> ```
> Or use the PM2 `ecosystem.config.js` which handles this correctly.

**Dependencies:**

| Package | Version | Role | Status |
|---|---|---|---|
| `react` | `^19.0.1` | Frontend framework | ✅ |
| `express` | `^4.21.2` | Backend API server | ✅ |
| `pg` | `^8.12.0` | PostgreSQL client | ✅ |
| `bcrypt` | `^6.0.0` | Password hashing | ✅ |
| `dotenv` | `^17.2.3` | Environment config | ✅ |
| `@google/genai` | `^2.4.0` | Gemini AI API | ✅ |
| `recharts` | `^3.9.2` | Dashboard charts | ✅ |
| `lucide-react` | `^0.546.0` | Icon library | ✅ |
| `motion` | `^12.23.24` | UI animations | ✅ |
| `react-router-dom` | `^7.18.1` | Frontend routing | ✅ |
| `tsx` | `^4.21.0` | TS transpiler (dev) | ⚠️ In `devDependencies` but needed at runtime in Docker |

> **Issue**: `tsx` is in `devDependencies` but the Dockerfile runs `npm ci --only=production`, which will exclude `tsx`. The `npm run api` command will fail in production containers.

---

## 3. TypeScript Configuration Audit

| Setting | Value | Assessment |
|---|---|---|
| `target` | `ES2022` | ✅ Modern, correct |
| `module` | `ESNext` | ✅ Correct for Vite + ESM |
| `moduleResolution` | `bundler` | ✅ Correct for Vite |
| `jsx` | `react-jsx` | ✅ React 19 compatible |
| `allowJs` | `true` | ✅ Allows JS in project |
| `noEmit` | `true` | ✅ Correct (Vite handles emit) |
| `strictNullChecks` | Not set (defaults to false) | ⚠️ Recommend `strict: true` |
| `paths` | `@/*` → `./` | ✅ Matches vite alias |

**Issue**: `strict` mode is not enabled. In production code, `strict: true` catches null/undefined errors at compile time.

---

## 4. Vite Configuration Audit

| Setting | Value | Status |
|---|---|---|
| Plugins | `react()`, `tailwindcss()` | ✅ |
| Path alias | `@` → project root | ✅ |
| Code splitting | Manual chunks: vendor, icons, charts | ✅ |
| HMR | Disabled via `DISABLE_HMR` env | ✅ |
| `historyApiFallback` | `true` | ✅ Required for React Router |

**Gap**: No `preview.port` set for `npm run preview`. Defaults to 4173 — ensure proxy/firewall rules account for this in staging.

---

## 5. Express Server Configuration Audit

| Feature | Implementation | Status |
|---|---|---|
| Port | `process.env.PORT \|\| 4000` | ✅ |
| JSON body parser | 15MB limit | ✅ |
| CORS | Dynamic from `APP_URL` env | ✅ |
| Rate limiting | In-memory sliding window | ✅ |
| Auth middleware | JWT HMAC-SHA256 | ✅ |
| Health endpoints | `/api/health`, `/api/health/liveness`, `/api/health/readiness` | ✅ |
| API versioning | `/api/v1/*` namespace | ✅ |
| Error handling | Per-route try/catch | ⚠️ No global error handler middleware |

**Issue**: No global Express error handler `app.use((err, req, res, next) => {...})`. Unhandled promise rejections in routes will crash without proper 500 responses.

---

## 6. PostgreSQL Configuration Audit

| Setting | Source | Status |
|---|---|---|
| `DATABASE_URL` | Environment variable | ✅ |
| `PGHOST/PORT/DB/USER/PASS` | Individual env vars (fallback) | ✅ |
| `PGSSLMODE` | `disable` (dev) / `require` (prod) | ✅ |
| `PGCONNECT_TIMEOUT_MS` | Default 1500ms | ✅ |
| Connection pool | `pg.Pool` with fallback to file | ✅ |
| Schema creation | `ensureSchema()` on startup | ✅ |
| Seed data | `seedInitialData()` on startup | ✅ |
| Dual-mode fallback | Automatic on connection failure | ✅ |

---

## 7. Docker Configuration Audit

### Dockerfile
| Item | Status | Note |
|---|---|---|
| Base image | `node:20-alpine` | ✅ Production-grade |
| Multi-stage build | Yes (builder + runner) | ✅ |
| `NODE_ENV=production` | Set in image | ✅ |
| Health check | `wget` on `/api/health` | ✅ |
| Port exposure | `4000` | ✅ |
| `npm ci --only=production` | Excludes `tsx` | ❌ **BLOCKER** — will fail at runtime |

**Critical Fix Required**: Move `tsx` to `dependencies` (not `devDependencies`), or switch to a compiled startup approach (esbuild the server before the production stage).

### docker-compose.yml
| Item | Status | Note |
|---|---|---|
| PostgreSQL service | `postgres:16-alpine` | ✅ |
| Health check | `pg_isready` | ✅ |
| Data volume | `postgres_data` | ✅ |
| App depends on DB | `service_healthy` condition | ✅ |
| Hardcoded passwords | `Password123!` | ❌ **SECURITY** — must use env secrets |
| Migration auto-run | Via `docker-entrypoint-initdb.d` | ✅ |

---

## 8. Environment Variable Audit

### Required Variables (Missing = Startup Failure)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4000` | API server port |
| `NODE_ENV` | No | unset | `production` in prod |
| `AUTH_SECRET` | **YES** | fallback dev value | JWT signing secret |
| `DATABASE_URL` | No | switches to file mode | PostgreSQL connection string |
| `APP_URL` | No | allows all origins | CORS allowed origins |
| `VITE_API_BASE_URL` | No | uses relative paths | Frontend API base URL |
| `GEMINI_API_KEY` | No (AI features) | n/a | Google Gemini AI API key |
| `BCRYPT_ROUNDS` | No | `12` | Bcrypt cost factor |

**Issue**: No startup validation enforces required variables in production. If `AUTH_SECRET` is unset, a weak default is used silently — **this is a security risk**.

---

## 9. Build Scripts Audit

| Script | Purpose | Status |
|---|---|---|
| `npm run build` | Vite production bundle → `dist/` | ✅ |
| `npm run lint` | TypeScript static analysis | ✅ |
| `npm test` | Server unit test suite | ✅ |
| `npm run migrate` | Apply DB migrations up | ✅ |
| `npm run migrate:rollback` | Rollback last migration | ✅ |
| `npm run migrate:status` | Show migration state | ✅ |
| `npm run api` | Start API server (tsx dev mode) | ⚠️ Dev only |

---

## 10. CI/CD Audit

| Step | Status |
|---|---|
| Checkout | ✅ |
| Node 20 setup with cache | ✅ |
| `npm ci` | ✅ |
| TypeScript lint | ✅ |
| Production build | ✅ |
| Test suite | ✅ |
| Migration status check | ✅ |
| Docker build/push | ❌ Missing — no container registry push |
| Staging deployment | ❌ Missing |
| Smoke tests post-deploy | ❌ Missing |

---

## 11. Issues Summary & Remediation Plan

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | 🔴 BLOCKER | `tsx` in `devDependencies` breaks Docker production build | Move `tsx` to `dependencies` |
| 2 | 🔴 SECURITY | `docker-compose.yml` has hardcoded DB password | Use `${POSTGRES_PASSWORD}` from env |
| 3 | 🟠 HIGH | No startup validation for `AUTH_SECRET` in production | Add env validation on startup |
| 4 | 🟠 HIGH | No global Express error handler | Add `app.use((err, req, res, next) => ...)` |
| 5 | 🟡 MEDIUM | Missing `.env.production` and `.env.staging` files | Generate from template |
| 6 | 🟡 MEDIUM | `package.json` name is `react-example` | Update to `pinaco-smart-advisor` |
| 7 | 🟡 MEDIUM | No `start` production script | Add `start` to `package.json` scripts |
| 8 | 🟢 LOW | `strict` TypeScript mode disabled | Add `"strict": true` to tsconfig |

---

*Audit completed by Antigravity AI Engine — PINACO Smart Advisor UAT Phase*
