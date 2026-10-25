# PINACO Smart Advisor — Deployment & Operations Guide

**Platform:** PINACO Smart Advisor (v1.0.0 Production)  
**Target Environments:** Cloud Run / Docker Compose / Bare-Metal PM2 Cluster  

---

## 1. Environment Setup & Configuration

### Prerequisites
- Node.js 20+ LTS
- PostgreSQL 16+ (or managed Cloud SQL / RDS)
- Docker & Docker Compose (optional for containerized deployments)
- PM2 Process Manager (optional for Node cluster deployments)

### Configuration Template
Copy `production.env.template` to `.env.production`:

```bash
cp production.env.template .env.production
```

Key environment variables:
- `NODE_ENV`: Set to `production`.
- `PORT`: HTTP listener port (default `4000`).
- `DATABASE_URL`: PostgreSQL connection string (`postgres://user:pass@host:5432/dbname?sslmode=require`).
- `JWT_SECRET`: Minimum 64-character random string for signing JWT tokens.
- `GEMINI_API_KEY`: Production Google Gemini API key.

---

## 2. Deployment Strategies

### Strategy A: Docker Compose (Recommended for On-Premise / Single Instance)

1. **Build and Launch Container Stack**:
   ```bash
   docker-compose up -d --build
   ```

2. **Verify Container Health**:
   ```bash
   docker-compose ps
   curl http://localhost:4000/api/health
   ```

3. **Database Migrations**:
   Migrations run automatically on PostgreSQL initial entrypoint via `./server/database/migrations/001_initial_schema.sql`.

---

### Strategy B: PM2 Cluster (Bare-Metal / VPS)

1. **Install Dependencies & Build Bundle**:
   ```bash
   npm ci
   npm run build
   ```

2. **Start PM2 Cluster**:
   ```bash
   pm2 start ecosystem.config.js --env production
   pm2 save
   ```

3. **Monitor PM2 Cluster Status**:
   ```bash
   pm2 status
   pm2 logs pinaco-smart-advisor
   ```

---

## 3. Health & Readiness Monitoring

The application exposes 3 RFC-compliant monitoring endpoints for load balancers, PM2, and Kubernetes:

- **Base Health**: `GET /api/health` -> Returns system status, storage mode, database description, and uptime.
- **Liveness Probe**: `GET /api/health/liveness` -> Returns HTTP 200 `{ status: "live" }`.
- **Readiness Probe**: `GET /api/health/readiness` -> Returns HTTP 200 `{ status: "ready" }`.
