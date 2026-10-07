# PINACO Smart Advisor — Database Schema & Data Dictionary

**Engine:** PostgreSQL 16+ (or Dual-Mode JSON Store Fallback)  

---

## 1. Schema Diagram & Table Relationships

```
[roles] <--- (1:N) --- [users] <--- (1:N) --- [customers] <--- (1:N) --- [loan_applications]
                         |                         |                              |
                         +--- (1:N) --- [documents]|                              +--- (1:N) --- [repayments]
                         |                         |                              |
                         +--- (1:N) --- [audit_logs]+--- (1:N) --- [events]       +--- (1:N) --- [decision_history]
```

---

## 2. Table Specifications

### `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(100) | PRIMARY KEY | User unique ID (`staff-001`, `client-101`) |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | User login email address |
| `password_hash` | VARCHAR(255) | NOT NULL | Bcrypt password hash |
| `name` | VARCHAR(255) | NOT NULL | User display full name |
| `role` | VARCHAR(50) | REFERENCES `roles(id)` | `admin`, `executive`, `manager`, `officer`, `customer` |
| `branch_id` | VARCHAR(50) | NULLABLE | Associated MFI branch ID |
| `created_at` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |

### `loan_applications`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(100) | PRIMARY KEY | Application ID (`APP-88421`) |
| `user_id` | VARCHAR(100) | REFERENCES `users(id)` | Applicant user ID |
| `customer_id` | VARCHAR(100) | REFERENCES `customers(id)`| Customer profile ID |
| `applicant_name` | VARCHAR(255) | NOT NULL | Full name of applicant |
| `amount` | NUMERIC(15,2) | NOT NULL | Requested loan principal in MWK |
| `status` | VARCHAR(50) | DEFAULT 'Under Review' | `Under Review`, `Approved`, `Decline`, `Pending Doc`, `Disbursed` |
| `sector` | VARCHAR(100) | NOT NULL | SME sector (`Agriculture`, `Retail`, etc.) |
| `score` | INT | DEFAULT 70 | Calculated credit health score (0-100) |
| `risk_level` | VARCHAR(20) | DEFAULT 'Medium' | Calculated risk tier (`Low`, `Medium`, `High`) |

### `decision_history` (AI Governance Log)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(100) | PRIMARY KEY | Record ID |
| `application_id` | VARCHAR(100) | REFERENCES `loan_applications(id)` | Target loan application |
| `ai_recommendation` | VARCHAR(50) | NOT NULL | AI expert verdict (`Approve`, `Decline`, `Review`) |
| `ai_confidence` | NUMERIC(5,2) | NOT NULL | AI recommendation confidence score |
| `ai_signals` | JSONB | DEFAULT '[]' | Supporting risk/payroll signals array |
| `officer_id` | VARCHAR(100) | REFERENCES `users(id)` | Loan officer decision maker ID |
| `officer_decision` | VARCHAR(50) | NOT NULL | Human officer final decision |
| `is_override` | BOOLEAN | DEFAULT FALSE | True if officer decision differed from AI recommendation |
| `overrideReason` | TEXT | NULLABLE | Justification written by human officer |
| `decided_at` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | Decision timestamp |
