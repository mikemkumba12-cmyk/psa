-- Migration 002: authentication, sessions, audit trail, notifications, messaging and settings.
-- Extends the relational schema from 001 instead of replacing it.

-- ── Roles ────────────────────────────────────────────────────────────────────
-- The application has always used 'loan_officer'; 001 seeded 'officer'.
INSERT INTO roles (id, name, description) VALUES
  ('admin', 'Administrator', 'Manages staff, permissions, products and system settings'),
  ('executive', 'Executive', 'Portfolio oversight and reporting'),
  ('manager', 'Manager', 'Assigns work, approves within limits, confirms transactions'),
  ('loan_officer', 'Loan Officer', 'Reviews applications, verifies documents, prepares assessments'),
  ('customer', 'Customer', 'Self-service portal for applicants and borrowers')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

UPDATE users SET role = 'loan_officer' WHERE role = 'officer';
DELETE FROM roles WHERE id = 'officer' AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'officer');

-- ── Users ────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS staff_title VARCHAR(120),
  ADD COLUMN IF NOT EXISTS approval_limit NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS security_question TEXT,
  ADD COLUMN IF NOT EXISTS security_answer_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{"sms": true, "email": true, "inApp": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) NOT NULL DEFAULT 'live';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_data_source_check;
ALTER TABLE users ADD CONSTRAINT users_data_source_check CHECK (data_source IN ('live', 'demo', 'test'));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));

-- ── Customers (individual profiles) ──────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender VARCHAR(30),
  ADD COLUMN IF NOT EXISTS employment_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS employer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS monthly_income NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS segment VARCHAR(20) NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS is_activated BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) NOT NULL DEFAULT 'live';

-- 001 gave every customer an invented 'Medium' risk level and 'New' type by default.
ALTER TABLE customers ALTER COLUMN risk_level DROP DEFAULT;
ALTER TABLE customers ALTER COLUMN customer_type DROP DEFAULT;
ALTER TABLE customers ALTER COLUMN location DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN sector DROP NOT NULL;

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_segment_check;
ALTER TABLE customers ADD CONSTRAINT customers_segment_check CHECK (segment IN ('individual', 'sme'));
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_data_source_check;
ALTER TABLE customers ADD CONSTRAINT customers_data_source_check CHECK (data_source IN ('live', 'demo', 'test'));

CREATE UNIQUE INDEX IF NOT EXISTS customers_national_id_key ON customers (upper(national_id)) WHERE national_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_user_id_key ON customers (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_name_idx ON customers (lower(name));

-- ── Sessions and credentials ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_method VARCHAR(20) NOT NULL DEFAULT 'password',
  user_agent TEXT,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS user_sessions_active_idx ON user_sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  device_type VARCHAR(30),
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  label VARCHAR(120) NOT NULL DEFAULT 'Passkey',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS webauthn_credentials_user_idx ON webauthn_credentials (user_id);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('register', 'login')),
  challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Audit trail (append-only) ────────────────────────────────────────────────
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64);
CREATE INDEX IF NOT EXISTS audit_logs_occurred_idx ON audit_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_id);

CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- ── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  action_route VARCHAR(255),
  entity_type VARCHAR(50),
  entity_id VARCHAR(100),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

-- ── Messaging between customers and staff ────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(100) PRIMARY KEY,
  customer_user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  subject VARCHAR(255) NOT NULL DEFAULT 'General enquiry',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_customer_idx ON conversations (customer_user_id);
CREATE INDEX IF NOT EXISTS conversations_staff_idx ON conversations (staff_user_id);

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(100) PRIMARY KEY,
  conversation_id VARCHAR(100) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, sent_at);

-- ── Institution settings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by VARCHAR(100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value, description) VALUES
  ('branding', '{
      "institutionName": "Pinnacle Financial Services",
      "shortName": "Pinnacle",
      "website": "https://pinnacle.co.mw",
      "supportEmail": null,
      "supportPhone": null,
      "address": null,
      "logoUrl": null
    }'::jsonb,
   'Institution identity shown in the portal. Contact details must be confirmed by the institution.'),
  ('membership_policy', '{
      "minimumMembershipMonths": 0,
      "requireVerifiedMember": true,
      "smeRequiresMemberOwnerOrDirector": true,
      "representativeRequiresVerifiedAuthorization": true,
      "confirmedByInstitution": false
    }'::jsonb,
   'SME membership eligibility rules. Values are placeholders until confirmed by the institution.'),
  ('assessment_thresholds', '{
      "maxIndividualDebtServiceRatio": 0.4,
      "minBusinessDebtServiceCoverage": 1.25,
      "maxInstallmentToRevenueRatio": 0.3,
      "minMonthsTrading": 6,
      "maxSingleCustomerConcentration": 0.6,
      "confirmedByInstitution": false
    }'::jsonb,
   'Thresholds used to flag risk indicators. They never approve or reject automatically. Placeholders until confirmed.'),
  ('workflow', '{
      "requireSeparationOfDuties": true,
      "offerValidityDays": 14
    }'::jsonb,
   'Loan workflow controls.')
ON CONFLICT (key) DO NOTHING;
