-- Migration 006: one application pipeline for individual and business borrowers,
-- from draft to repayment, with assessments, offers and maker-checker transactions.

-- ── Applications ─────────────────────────────────────────────────────────────
-- 001 filled new applications with invented values (3.5% rate, score 70, 'Medium' risk, 'Good' history, 25% DTI).
ALTER TABLE loan_applications ALTER COLUMN interest_rate DROP DEFAULT;
ALTER TABLE loan_applications ALTER COLUMN score DROP DEFAULT;
ALTER TABLE loan_applications ALTER COLUMN risk_level DROP DEFAULT;
ALTER TABLE loan_applications ALTER COLUMN repayment_history DROP DEFAULT;
ALTER TABLE loan_applications ALTER COLUMN debt_to_income DROP DEFAULT;
ALTER TABLE loan_applications ALTER COLUMN monthly_revenue DROP DEFAULT;
ALTER TABLE loan_applications ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE loan_applications ALTER COLUMN sector DROP NOT NULL;
ALTER TABLE loan_applications ALTER COLUMN date DROP NOT NULL;
ALTER TABLE loan_applications ALTER COLUMN interest_rate TYPE NUMERIC(7,4);

CREATE SEQUENCE IF NOT EXISTS loan_application_reference_seq START 1000;

ALTER TABLE loan_applications
  ADD COLUMN IF NOT EXISTS reference VARCHAR(30),
  ADD COLUMN IF NOT EXISTS product_id VARCHAR(100) REFERENCES loan_products(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS borrower_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS business_id VARCHAR(100) REFERENCES businesses(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS purpose TEXT,
  ADD COLUMN IF NOT EXISTS interest_method VARCHAR(20),
  ADD COLUMN IF NOT EXISTS product_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS applicant_declared JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_officer_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS info_request_note TEXT,
  ADD COLUMN IF NOT EXISTS recommendation VARCHAR(20),
  ADD COLUMN IF NOT EXISTS recommendation_note TEXT,
  ADD COLUMN IF NOT EXISTS recommended_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recommended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decided_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS approved_term_months INT,
  ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) NOT NULL DEFAULT 'live';

ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_status_check CHECK (status IN (
  'draft', 'submitted', 'under_review', 'info_requested', 'assessed', 'recommended',
  'approved', 'rejected', 'offer_issued', 'offer_accepted', 'offer_declined',
  'disbursed', 'closed', 'withdrawn'
)) NOT VALID;
ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_borrower_type_check
  CHECK (borrower_type IN ('individual', 'business')) NOT VALID;
ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_business_borrower_check
  CHECK (borrower_type <> 'business' OR business_id IS NOT NULL) NOT VALID;
ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_recommendation_check
  CHECK (recommendation IS NULL OR recommendation IN ('approve', 'decline'));
ALTER TABLE loan_applications ADD CONSTRAINT loan_applications_data_source_check
  CHECK (data_source IN ('live', 'demo', 'test'));

CREATE UNIQUE INDEX IF NOT EXISTS loan_applications_reference_key ON loan_applications (reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS loan_applications_status_idx ON loan_applications (status);
CREATE INDEX IF NOT EXISTS loan_applications_customer_idx ON loan_applications (customer_id);
CREATE INDEX IF NOT EXISTS loan_applications_business_idx ON loan_applications (business_id);
CREATE INDEX IF NOT EXISTS loan_applications_product_idx ON loan_applications (product_id);
CREATE INDEX IF NOT EXISTS loan_applications_officer_idx ON loan_applications (assigned_officer_id, status);
CREATE INDEX IF NOT EXISTS loan_applications_submitted_idx ON loan_applications (submitted_at);

-- Every status change, with who made it and why.
CREATE TABLE IF NOT EXISTS application_events (
  id BIGSERIAL PRIMARY KEY,
  application_id VARCHAR(100) NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  actor_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(50),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_events_app_idx ON application_events (application_id, created_at);
CREATE INDEX IF NOT EXISTS application_events_status_idx ON application_events (to_status, created_at);

-- Officer assessments. Inputs carry their provenance (verified / applicant / estimated).
CREATE TABLE IF NOT EXISTS application_assessments (
  id VARCHAR(100) PRIMARY KEY,
  application_id VARCHAR(100) NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  assessed_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  inputs JSONB NOT NULL,
  results JSONB NOT NULL,
  indicators JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_information JSONB NOT NULL DEFAULT '[]'::jsonb,
  officer_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_assessments_app_idx ON application_assessments (application_id, created_at DESC);

-- ── Offers ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_offers (
  id VARCHAR(100) PRIMARY KEY,
  application_id VARCHAR(100) NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  term_months INT NOT NULL CHECK (term_months > 0),
  interest_method VARCHAR(20) NOT NULL,
  interest_rate_monthly NUMERIC(7,4) NOT NULL,
  repayment_frequency VARCHAR(20) NOT NULL,
  fees JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_fees NUMERIC(15,2) NOT NULL DEFAULT 0,
  installment_amount NUMERIC(15,2) NOT NULL,
  total_repayable NUMERIC(15,2) NOT NULL,
  schedule JSONB NOT NULL,
  conditions TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'accepted', 'declined', 'expired', 'withdrawn')),
  expires_at TIMESTAMPTZ NOT NULL,
  issued_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS loan_offers_one_open_key ON loan_offers (application_id) WHERE status = 'issued';

-- ── Repayment schedule (table from 001) ──────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS loan_installments_app_number_key ON loan_installments (application_id, installment_number);
CREATE INDEX IF NOT EXISTS loan_installments_due_idx ON loan_installments (due_date, status);

-- ── Money movements (maker-checker) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_transactions (
  id VARCHAR(100) PRIMARY KEY,
  application_id VARCHAR(100) NOT NULL REFERENCES loan_applications(id) ON DELETE RESTRICT,
  type VARCHAR(20) NOT NULL CHECK (type IN ('disbursement', 'repayment')),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  value_date DATE NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('bank_transfer', 'mobile_money', 'payroll', 'cash', 'cheque')),
  external_reference VARCHAR(120) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation', 'confirmed', 'rejected')),
  notes TEXT,
  recorded_by VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_by VARCHAR(100) REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  data_source VARCHAR(20) NOT NULL DEFAULT 'live' CHECK (data_source IN ('live', 'demo', 'test')),
  CONSTRAINT loan_transactions_maker_checker CHECK (confirmed_by IS NULL OR confirmed_by <> recorded_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS loan_transactions_reference_key
  ON loan_transactions (channel, upper(external_reference)) WHERE status <> 'rejected';
CREATE INDEX IF NOT EXISTS loan_transactions_app_idx ON loan_transactions (application_id, value_date);
CREATE INDEX IF NOT EXISTS loan_transactions_status_idx ON loan_transactions (status, type);

-- ── Payroll deductions (tables from 001) ─────────────────────────────────────
ALTER TABLE payroll_batches
  ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'uploaded';

ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS customer_id VARCHAR(100) REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS application_id VARCHAR(100) REFERENCES loan_applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100) REFERENCES loan_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;
CREATE INDEX IF NOT EXISTS payroll_records_customer_idx ON payroll_records (customer_id);
