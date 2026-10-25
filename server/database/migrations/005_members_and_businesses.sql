-- Migration 005: member register and SME business profiles.

-- ── Member register ──────────────────────────────────────────────────────────
-- A member is an individual customer whose membership has been recorded by staff.
-- Typing a member number never makes someone a member; only staff with members.manage can.
CREATE TABLE IF NOT EXISTS members (
  id VARCHAR(100) PRIMARY KEY,
  customer_id VARCHAR(100) NOT NULL UNIQUE REFERENCES customers(id) ON DELETE RESTRICT,
  member_number VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'terminated')),
  joined_on DATE,
  status_reason TEXT,
  verified_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_source VARCHAR(20) NOT NULL DEFAULT 'live' CHECK (data_source IN ('live', 'demo', 'test'))
);
CREATE UNIQUE INDEX IF NOT EXISTS members_number_key ON members (upper(member_number));
CREATE INDEX IF NOT EXISTS members_status_idx ON members (status);

-- ── Businesses ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id VARCHAR(100) PRIMARY KEY,
  registered_name VARCHAR(255) NOT NULL,
  trading_name VARCHAR(255),
  registration_number VARCHAR(100),
  legal_structure VARCHAR(30) NOT NULL CHECK (legal_structure IN (
    'sole_proprietorship', 'partnership', 'private_limited', 'public_limited', 'cooperative', 'other'
  )),
  tpin VARCHAR(50),
  sector VARCHAR(100) NOT NULL,
  district VARCHAR(100) NOT NULL,
  physical_address TEXT,
  date_established DATE,
  employee_count INT CHECK (employee_count IS NULL OR employee_count >= 0),
  description TEXT,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'unverified' CHECK (verification_status IN (
    'unverified', 'pending_verification', 'verified', 'rejected'
  )),
  verification_note TEXT,
  verified_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_source VARCHAR(20) NOT NULL DEFAULT 'live' CHECK (data_source IN ('live', 'demo', 'test'))
);
CREATE UNIQUE INDEX IF NOT EXISTS businesses_registration_key ON businesses (upper(registration_number)) WHERE registration_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS businesses_tpin_key ON businesses (upper(tpin)) WHERE tpin IS NOT NULL;
CREATE INDEX IF NOT EXISTS businesses_name_idx ON businesses (lower(registered_name));
CREATE INDEX IF NOT EXISTS businesses_sector_idx ON businesses (sector);

ALTER TABLE documents ADD CONSTRAINT documents_business_fkey
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;

-- People linked to a business: owners, directors, beneficial owners, representatives, guarantors.
CREATE TABLE IF NOT EXISTS business_parties (
  id VARCHAR(100) PRIMARY KEY,
  business_id VARCHAR(100) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id VARCHAR(100) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  role VARCHAR(30) NOT NULL CHECK (role IN ('owner', 'director', 'beneficial_owner', 'representative', 'guarantor')),
  ownership_pct NUMERIC(5,2) CHECK (ownership_pct IS NULL OR (ownership_pct >= 0 AND ownership_pct <= 100)),
  is_signatory BOOLEAN NOT NULL DEFAULT FALSE,
  authorization_document_id VARCHAR(100) REFERENCES documents(id) ON DELETE SET NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  added_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, customer_id, role)
);
CREATE INDEX IF NOT EXISTS business_parties_customer_idx ON business_parties (customer_id);

-- Financial information with provenance: what the applicant declared vs what staff verified.
CREATE TABLE IF NOT EXISTS business_financials (
  id VARCHAR(100) PRIMARY KEY,
  business_id VARCHAR(100) NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  avg_monthly_revenue NUMERIC(15,2) NOT NULL CHECK (avg_monthly_revenue >= 0),
  avg_monthly_cost_of_sales NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (avg_monthly_cost_of_sales >= 0),
  avg_monthly_operating_expenses NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (avg_monthly_operating_expenses >= 0),
  existing_monthly_debt_service NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (existing_monthly_debt_service >= 0),
  largest_customer_share NUMERIC(5,4) CHECK (largest_customer_share IS NULL OR (largest_customer_share >= 0 AND largest_customer_share <= 1)),
  source VARCHAR(20) NOT NULL CHECK (source IN ('applicant', 'verified')),
  supporting_document_id VARCHAR(100) REFERENCES documents(id) ON DELETE SET NULL,
  notes TEXT,
  recorded_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_financials_period_check CHECK (period_start <= period_end)
);
CREATE INDEX IF NOT EXISTS business_financials_business_idx ON business_financials (business_id, period_end DESC);
