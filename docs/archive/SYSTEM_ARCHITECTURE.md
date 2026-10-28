# PINACO Smart Advisor — System Architecture Document

**Version:** 1.0.0 (Production Architecture)  

---

## 1. High-Level Architecture Overview

PINACO Smart Advisor is designed as a hybrid enterprise microfinance management system. It combines a modern single-page application (SPA) user interface with a high-performance Express REST backend, supported by an expert intelligence engine and a dual-mode persistence layer.

```
+-----------------------------------------------------------------------+
|                         React SPA (Vite + TS)                          |
|   +-------------------+    +--------------------+    +------------+   |
|   |   Client Portal   |    |    Admin Portal    |    | Intelligence|   |
|   +-------------------+    +--------------------+    +------------+   |
+-----------------------------------------------------------------------+
                                   | HTTP / REST (JWT)
                                   v
+-----------------------------------------------------------------------+
|                           Express 4 API Server                         |
|   +------------------+    +--------------------+    +-------------+   |
|   | Auth & RBAC Guard|    | v1 Route Modules   |    | Rate Limiter|   |
|   +------------------+    +--------------------+    +-------------+   |
+-----------------------------------------------------------------------+
         |                          |                         |
         v                          v                         v
+-------------------+      +------------------+      +------------------+
|  Services Layer   | ---->| Repositories     | ---->| Dual Persistence |
|  - Credit Assess  |      | - customerRepo   |      | - PostgreSQL     |
|  - Employer Risk  |      | - loanRepo       |      | - JSON Store     |
|  - AI Governance  |      | - payrollRepo    |      |   (Fallback)     |
|  - Scenario Gen   |      | - governanceRepo |      |                  |
+-------------------+      +------------------+      +------------------+
```

---

## 2. Layer Definitions & Design Principles

### 1. Presentation Layer (`src/`)
- Built with **React 19**, **TypeScript**, and **Tailwind CSS**.
- Strict role isolation between Client Portal (`/client/*`) and Staff/Admin Operations (`/staff/*`).
- Global state managed via `ClientContext` and `AdminContext`.

### 2. Service Layer (`server/services/`)
- Encapsulates domain logic and intelligence calculations.
- Contains `creditAssessmentService`, `employerRiskService`, `aiGovernanceService`, and `scenarioGeneratorService`.

### 3. Repository Layer (`server/repositories/`)
- Decouples domain services from persistence implementations.
- Implements `customerRepository`, `loanRepository`, `payrollRepository`, and `governanceRepository`.

### 4. Dual-Mode Persistence Layer (`server/db.ts` & `server/mockDb.ts`)
- **Primary Mode**: PostgreSQL cluster via `pg.Pool` with schema migrations (`001_initial_schema.sql`).
- **Fallback Mode**: Atomic JSON file-backed database (`mockDb.ts`) that guarantees 100% offline and demo capability without external DB dependencies.
