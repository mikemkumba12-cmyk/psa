-- Migration 004: administrator-controlled permissions and configurable loan products.

-- ── Permission catalogue ─────────────────────────────────────────────────────
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 100;

INSERT INTO permissions (id, name, resource, action, description, sort_order) VALUES
  ('customers.view', 'View customers', 'customers', 'view', 'View individual customer profiles', 10),
  ('customers.manage', 'Manage customers', 'customers', 'manage', 'Create and edit customer profiles', 11),
  ('members.view', 'View member register', 'members', 'view', 'View membership records', 20),
  ('members.manage', 'Manage members', 'members', 'manage', 'Register members and verify or change membership status', 21),
  ('businesses.view', 'View business profiles', 'businesses', 'view', 'View SME business profiles', 30),
  ('businesses.manage', 'Manage business profiles', 'businesses', 'manage', 'Create and edit business profiles and linked parties', 31),
  ('businesses.verify', 'Verify businesses', 'businesses', 'verify', 'Mark businesses and their linked parties as verified', 32),
  ('documents.view', 'View documents', 'documents', 'view', 'Preview and download customer and business documents', 40),
  ('documents.verify', 'Verify documents', 'documents', 'verify', 'Approve or reject uploaded documents', 41),
  ('documents.delete', 'Delete documents', 'documents', 'delete', 'Remove documents (soft delete with reason)', 42),
  ('applications.view_all', 'View all applications', 'applications', 'view_all', 'See applications not assigned to you, within your products', 50),
  ('applications.all_products', 'All loan products', 'applications', 'all_products', 'Work on every loan product without product assignments', 51),
  ('applications.assign', 'Assign applications', 'applications', 'assign', 'Assign applications to officers', 52),
  ('applications.assess', 'Assess applications', 'applications', 'assess', 'Record credit assessments', 53),
  ('applications.recommend', 'Recommend decisions', 'applications', 'recommend', 'Submit recommendations for approval or rejection', 54),
  ('applications.request_info', 'Request information', 'applications', 'request_info', 'Return applications to the applicant for more information', 55),
  ('applications.approve', 'Approve loans', 'applications', 'approve', 'Approve applications within your approval limit', 56),
  ('applications.reject', 'Reject applications', 'applications', 'reject', 'Reject applications with a recorded reason', 57),
  ('offers.prepare', 'Prepare offers', 'offers', 'prepare', 'Issue loan offers for approved applications', 60),
  ('disbursements.record', 'Record disbursements', 'transactions', 'record_disbursement', 'Record a disbursement for confirmation', 70),
  ('disbursements.confirm', 'Confirm disbursements', 'transactions', 'confirm_disbursement', 'Confirm a disbursement recorded by someone else', 71),
  ('repayments.record', 'Record repayments', 'transactions', 'record_repayment', 'Record a repayment for confirmation', 72),
  ('repayments.confirm', 'Confirm repayments', 'transactions', 'confirm_repayment', 'Confirm a repayment recorded by someone else', 73),
  ('payroll.manage', 'Manage payroll deductions', 'payroll', 'manage', 'Upload and reconcile payroll deduction files', 75),
  ('reports.view', 'View reports', 'reports', 'view', 'View operational and portfolio reports', 80),
  ('reports.export', 'Export reports', 'reports', 'export', 'Download report data as CSV', 81),
  ('reports.sme', 'View SME reports', 'reports', 'sme', 'View SME pipeline and portfolio reports', 82),
  ('products.manage', 'Manage loan products', 'products', 'manage', 'Create and configure loan products', 90),
  ('staff.manage', 'Manage staff', 'staff', 'manage', 'Create staff accounts and deactivate them', 91),
  ('permissions.manage', 'Manage permissions', 'permissions', 'manage', 'Grant and revoke staff permissions, products and limits', 92),
  ('settings.manage', 'Manage settings', 'settings', 'manage', 'Change institution settings and policies', 93),
  ('audit.view', 'View audit log', 'audit', 'view', 'Read the audit trail', 94),
  ('knowledge.manage', 'Manage assistant knowledge', 'knowledge', 'manage', 'Add and approve reference documents for the assistant', 95)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, resource = EXCLUDED.resource, action = EXCLUDED.action,
  description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

-- Role defaults. Administrators implicitly hold every permission in code, so they are not listed.
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id VARCHAR(50) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id VARCHAR(50) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('loan_officer', 'customers.view'), ('loan_officer', 'members.view'), ('loan_officer', 'businesses.view'),
  ('loan_officer', 'documents.view'), ('loan_officer', 'documents.verify'),
  ('loan_officer', 'applications.assess'), ('loan_officer', 'applications.recommend'),
  ('loan_officer', 'applications.request_info'), ('loan_officer', 'offers.prepare'),
  ('loan_officer', 'disbursements.record'), ('loan_officer', 'repayments.record'),

  ('manager', 'customers.view'), ('manager', 'customers.manage'), ('manager', 'members.view'), ('manager', 'members.manage'),
  ('manager', 'businesses.view'), ('manager', 'businesses.manage'), ('manager', 'businesses.verify'),
  ('manager', 'documents.view'), ('manager', 'documents.verify'),
  ('manager', 'applications.view_all'), ('manager', 'applications.all_products'), ('manager', 'applications.assign'),
  ('manager', 'applications.request_info'), ('manager', 'applications.approve'), ('manager', 'applications.reject'),
  ('manager', 'offers.prepare'), ('manager', 'disbursements.confirm'), ('manager', 'repayments.confirm'),
  ('manager', 'payroll.manage'), ('manager', 'reports.view'), ('manager', 'reports.export'), ('manager', 'reports.sme'),
  ('manager', 'audit.view'),

  ('executive', 'customers.view'), ('executive', 'members.view'), ('executive', 'businesses.view'),
  ('executive', 'applications.view_all'), ('executive', 'applications.all_products'),
  ('executive', 'reports.view'), ('executive', 'reports.export'), ('executive', 'reports.sme'), ('executive', 'audit.view')
ON CONFLICT DO NOTHING;

-- Per-user overrides on top of the role defaults.
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id VARCHAR(50) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  effect VARCHAR(10) NOT NULL CHECK (effect IN ('grant', 'deny')),
  granted_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_id)
);

-- ── Loan products ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_products (
  id VARCHAR(100) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN (
    'payroll', 'personal', 'working_capital', 'enterprise', 'asset_financing', 'invoice_discounting', 'order_financing'
  )),
  borrower_type VARCHAR(20) NOT NULL CHECK (borrower_type IN ('individual', 'business')),
  description TEXT NOT NULL DEFAULT '',
  min_amount NUMERIC(15,2),
  max_amount NUMERIC(15,2),
  min_term_months INT,
  max_term_months INT,
  interest_method VARCHAR(20) NOT NULL DEFAULT 'reducing_balance' CHECK (interest_method IN ('flat', 'reducing_balance')),
  interest_rate_monthly NUMERIC(7,4),
  repayment_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (repayment_frequency IN ('monthly', 'bullet')),
  fees JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_documents TEXT[] NOT NULL DEFAULT '{}',
  eligibility JSONB NOT NULL DEFAULT '{}'::jsonb,
  members_only BOOLEAN NOT NULL DEFAULT FALSE,
  collateral_required BOOLEAN NOT NULL DEFAULT FALSE,
  collateral_notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'suspended', 'retired')),
  terms_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from DATE,
  effective_to DATE,
  created_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  updated_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_source VARCHAR(20) NOT NULL DEFAULT 'live' CHECK (data_source IN ('live', 'demo', 'test')),
  CONSTRAINT loan_products_amounts_check CHECK (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount),
  CONSTRAINT loan_products_terms_check CHECK (min_term_months IS NULL OR max_term_months IS NULL OR min_term_months <= max_term_months),
  CONSTRAINT loan_products_dates_check CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_from <= effective_to),
  -- A product can only be offered once every term the system calculates with has been configured.
  CONSTRAINT loan_products_active_configured CHECK (
    status <> 'active' OR (
      min_amount IS NOT NULL AND max_amount IS NOT NULL AND
      min_term_months IS NOT NULL AND max_term_months IS NOT NULL AND
      interest_rate_monthly IS NOT NULL
    )
  )
);
CREATE INDEX IF NOT EXISTS loan_products_status_idx ON loan_products (status, borrower_type);

-- Which products a staff member may process.
CREATE TABLE IF NOT EXISTS user_product_access (
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id VARCHAR(100) NOT NULL REFERENCES loan_products(id) ON DELETE CASCADE,
  granted_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
