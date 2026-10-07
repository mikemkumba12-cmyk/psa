-- PostgreSQL DDL Migration 001: Initial Core Schema & Expanded Intelligence Tables
-- Target: PINACO Smart Advisor Production Database

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  resource VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(100) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  branch_id VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employers (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  sector VARCHAR(100) NOT NULL,
  employee_count INT DEFAULT 0,
  risk_rating VARCHAR(20) DEFAULT 'Low',
  successful_deduction_rate NUMERIC(5,2) DEFAULT 100.00,
  failed_deduction_rate NUMERIC(5,2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(100) NOT NULL,
  sector VARCHAR(100) NOT NULL,
  employer_id VARCHAR(100) REFERENCES employers(id) ON DELETE SET NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  employee_number VARCHAR(100),
  national_id VARCHAR(100),
  active_loans INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Active',
  risk_level VARCHAR(20) DEFAULT 'Medium',
  customer_type VARCHAR(50) DEFAULT 'New',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loan_applications (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  customer_id VARCHAR(100) REFERENCES customers(id) ON DELETE SET NULL,
  applicant_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  business_name VARCHAR(255),
  monthly_revenue NUMERIC(15,2) DEFAULT 0,
  amount NUMERIC(15,2) NOT NULL,
  term_months INT NOT NULL,
  interest_rate NUMERIC(5,2) DEFAULT 3.5,
  status VARCHAR(50) DEFAULT 'Under Review',
  sector VARCHAR(100) NOT NULL,
  score INT DEFAULT 70,
  risk_level VARCHAR(20) DEFAULT 'Medium',
  repayment_history VARCHAR(50) DEFAULT 'Good',
  debt_to_income VARCHAR(20) DEFAULT '25%',
  loan_officer VARCHAR(255),
  branch_id VARCHAR(50),
  disbursed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  date VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS repayments (
  id VARCHAR(100) PRIMARY KEY,
  application_id VARCHAR(100) NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  installment_number INT NOT NULL,
  due_date VARCHAR(50) NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  principal NUMERIC(15,2) NOT NULL,
  interest NUMERIC(15,2) NOT NULL,
  penalty NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Scheduled',
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Expanded Table 1: Normalized Loan Installments Schedule
CREATE TABLE IF NOT EXISTS loan_installments (
  id VARCHAR(100) PRIMARY KEY,
  application_id VARCHAR(100) NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  installment_number INT NOT NULL,
  due_date DATE NOT NULL,
  principal_due NUMERIC(15,2) NOT NULL,
  interest_due NUMERIC(15,2) NOT NULL,
  penalty_due NUMERIC(15,2) DEFAULT 0,
  total_due NUMERIC(15,2) NOT NULL,
  amount_paid NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Scheduled',
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_batches (
  id VARCHAR(100) PRIMARY KEY,
  month VARCHAR(20) NOT NULL,
  employer VARCHAR(255) NOT NULL,
  total_records INT DEFAULT 0,
  matched_count INT DEFAULT 0,
  unmatched_count INT DEFAULT 0,
  total_amount NUMERIC(15,2) DEFAULT 0,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id VARCHAR(100) PRIMARY KEY,
  batch_id VARCHAR(100) REFERENCES payroll_batches(id) ON DELETE CASCADE,
  employee_id VARCHAR(100) NOT NULL,
  employee_name VARCHAR(255) NOT NULL,
  employer VARCHAR(255) NOT NULL,
  deduction_amount NUMERIC(15,2) NOT NULL,
  month VARCHAR(20) NOT NULL,
  status VARCHAR(50) DEFAULT 'Pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  size INT NOT NULL,
  url TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_extractions (
  id VARCHAR(100) PRIMARY KEY,
  document_id VARCHAR(100) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  application_id VARCHAR(100) REFERENCES loan_applications(id) ON DELETE SET NULL,
  extracted_fields JSONB NOT NULL,
  mismatches JSONB DEFAULT '[]'::jsonb,
  source VARCHAR(50) DEFAULT 'manual',
  confidence NUMERIC(5,2) DEFAULT 100.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Expanded Table 2: Event-Sourced Customer Risk Timeline
CREATE TABLE IF NOT EXISTS customer_events (
  id VARCHAR(100) PRIMARY KEY,
  customer_id VARCHAR(100) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  risk_level VARCHAR(20) NOT NULL,
  score INT,
  trigger_event VARCHAR(255) NOT NULL,
  details TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Intelligence Scores Summary
CREATE TABLE IF NOT EXISTS intelligence_scores (
  id VARCHAR(100) PRIMARY KEY,
  customer_id VARCHAR(100) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  score INT NOT NULL,
  tier VARCHAR(50) NOT NULL,
  positive_factors JSONB DEFAULT '[]'::jsonb,
  negative_factors JSONB DEFAULT '[]'::jsonb,
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Expanded Table 3: Human Officer Decision History & AI Recommendation Governance
CREATE TABLE IF NOT EXISTS decision_history (
  id VARCHAR(100) PRIMARY KEY,
  application_id VARCHAR(100) NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  ai_recommendation VARCHAR(50) NOT NULL,
  ai_confidence NUMERIC(5,2) NOT NULL,
  ai_signals JSONB DEFAULT '[]'::jsonb,
  officer_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  officer_decision VARCHAR(50) NOT NULL,
  is_override BOOLEAN DEFAULT FALSE,
  override_reason TEXT,
  decided_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(100) PRIMARY KEY,
  actor_id VARCHAR(100) NOT NULL,
  actor_name VARCHAR(255) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100),
  outcome VARCHAR(20) DEFAULT 'success',
  summary TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Query Performance
CREATE INDEX IF NOT EXISTS idx_loan_applications_user ON loan_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_repayments_application ON repayments(application_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_batch ON payroll_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_customer_events_customer ON customer_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_decision_history_app ON decision_history(application_id);
