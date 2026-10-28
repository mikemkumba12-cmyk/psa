# PINACO Smart Advisor — Go-Live & Deployment Guide

**Date:** July 21, 2026  
**Target:** Production Deployment Engineering Team  
**System:** PINACO Smart Advisor v1.0.0  

---

## 1. Deployment Checklists

### A. Pre-Deployment Checklist
- [x] All 26 backend unit tests passing (`npm test`).
- [x] TypeScript clean build with 0 errors (`npm run lint`).
- [x] Production bundle generated (`npm run build`).
- [x] Production secrets configured in `.env.production`.
- [x] PostgreSQL database cluster provisioned and accessible over TLS (`sslmode=require`).
- [x] Health check endpoint `/api/health` responding.

### B. Go-Live Checklist (Execution Steps)
1. **Clone & Setup**:
   ```bash
   git clone https://github.com/pinnacle-mfi/pinaco-smart-advisor.git
   cd pinaco-smart-advisor
   cp .env.production .env
   ```
2. **Execute Database Migrations**:
   ```bash
   npm run migrate
   ```
3. **Start Application Cluster (Docker Compose)**:
   ```bash
   docker-compose up -d --build
   ```
4. **Verify Container Health**:
   ```bash
   docker-compose ps
   curl -I http://localhost:4000/api/health
   curl -I http://localhost:4000/api/health/readiness
   ```

### C. Rollback Checklist (Emergency Contingency)
If production deployment encounters unexpected failures:
1. **Stop New Containers**:
   ```bash
   docker-compose down
   ```
2. **Rollback Migration Record (if needed)**:
   ```bash
   npm run migrate:rollback
   ```
3. **Revert to Previous Production Tag**:
   ```bash
   git checkout tags/v0.9.5-stable
   docker-compose up -d --build
   ```

### D. Post-Go-Live Verification Checklist
- [ ] Confirm staff login (`admin@pinnacle.mw`, `chisomo@pinnacle.mw`).
- [ ] Submit test loan application from client portal.
- [ ] Verify loan officer review queue and AI recommendation display.
- [ ] Verify audit log write in `AdminAuditTrail.tsx`.
- [ ] Inspect error logs for unhandled 500 exceptions.

### E. Post-Launch Monitoring Checklist
- [ ] Monitor CPU and Memory utilization (< 70% threshold).
- [ ] Monitor API endpoint latency (< 100ms threshold).
- [ ] Check daily PostgreSQL automated backup execution.
- [ ] Monitor error rate in application logs.

---

*Go-Live Guide created by Antigravity AI Engine — PINACO Smart Advisor*
