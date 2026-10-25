-- Migration 003: document management.
-- Files live in private storage (see server/storage); this table holds metadata and the storage reference only.

CREATE TABLE IF NOT EXISTS document_types (
  code VARCHAR(50) PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  owner_scope VARCHAR(20) NOT NULL CHECK (owner_scope IN ('customer', 'business', 'application', 'any')),
  has_expiry BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO document_types (code, label, owner_scope, has_expiry, description, sort_order) VALUES
  ('national_id_front', 'National ID (front)', 'customer', TRUE, 'Front side of the national identity card', 10),
  ('national_id_back', 'National ID (back)', 'customer', TRUE, 'Back side of the national identity card', 11),
  ('passport', 'Passport', 'customer', TRUE, 'Passport photo page', 12),
  ('proof_of_address', 'Proof of address', 'customer', FALSE, 'Utility bill or letter confirming residence', 13),
  ('payslip', 'Payslip', 'any', FALSE, 'Recent payslip', 20),
  ('proof_of_income', 'Proof of income', 'any', FALSE, 'Other evidence of regular income', 21),
  ('employment_letter', 'Employment letter', 'customer', FALSE, 'Letter confirming employment', 22),
  ('bank_statement', 'Bank statement', 'any', FALSE, 'Bank or mobile money statement', 23),
  ('business_registration', 'Business registration certificate', 'business', FALSE, 'Certificate of registration or incorporation', 30),
  ('tax_clearance', 'Tax clearance certificate', 'business', TRUE, 'MRA tax clearance certificate', 31),
  ('tpin_certificate', 'TPIN certificate', 'business', FALSE, 'Taxpayer identification number certificate', 32),
  ('ownership_document', 'Ownership documents', 'business', FALSE, 'Shareholding, partnership deed or memorandum showing ownership', 33),
  ('authorization_letter', 'Authorization / board resolution', 'business', FALSE, 'Evidence that a representative may act for the business', 34),
  ('business_profile', 'Business profile', 'business', FALSE, 'Description of the business and its operations', 35),
  ('financial_statements', 'Financial statements', 'business', FALSE, 'Audited or management financial statements', 36),
  ('management_accounts', 'Management accounts', 'business', FALSE, 'Recent management accounts', 37),
  ('invoice', 'Invoice', 'application', FALSE, 'Invoice to be discounted', 40),
  ('purchase_order', 'Purchase order', 'application', FALSE, 'Confirmed customer purchase order', 41),
  ('signed_contract', 'Signed contract', 'application', FALSE, 'Signed contract or customer order', 42),
  ('asset_quotation', 'Asset quotation', 'application', FALSE, 'Pro-forma invoice or quotation for the asset', 43),
  ('collateral_document', 'Collateral / security document', 'application', FALSE, 'Evidence of security offered', 44),
  ('signed_offer', 'Signed loan offer', 'application', FALSE, 'Offer letter signed by the borrower', 50),
  ('other', 'Other document', 'any', FALSE, 'Any other supporting document', 99)
ON CONFLICT (code) DO NOTHING;

-- Reshape the 001 documents table rather than creating a competing one.
ALTER TABLE documents RENAME COLUMN user_id TO uploaded_by;
ALTER TABLE documents RENAME COLUMN name TO original_name;
ALTER TABLE documents RENAME COLUMN type TO document_type;
ALTER TABLE documents RENAME COLUMN size TO size_bytes;
ALTER TABLE documents ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN url DROP NOT NULL;
COMMENT ON COLUMN documents.url IS 'Deprecated. Documents are served only through the authenticated API.';

-- Deleting a user must never silently delete the documents they uploaded.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_user_id_fkey;
ALTER TABLE documents ADD CONSTRAINT documents_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS customer_id VARCHAR(100) REFERENCES customers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS business_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS application_id VARCHAR(100) REFERENCES loan_applications(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS storage_driver VARCHAR(20),
  ADD COLUMN IF NOT EXISTS storage_key TEXT,
  ADD COLUMN IF NOT EXISTS encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS expires_on DATE,
  ADD COLUMN IF NOT EXISTS replaces_document_id VARCHAR(100) REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT,
  ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) NOT NULL DEFAULT 'live';

ALTER TABLE documents ADD CONSTRAINT documents_type_fkey
  FOREIGN KEY (document_type) REFERENCES document_types(code) NOT VALID;
ALTER TABLE documents ADD CONSTRAINT documents_status_check
  CHECK (status IN ('pending_review', 'verified', 'rejected', 'replaced', 'deleted'));
ALTER TABLE documents ADD CONSTRAINT documents_owner_check
  CHECK (customer_id IS NOT NULL OR business_id IS NOT NULL OR application_id IS NOT NULL) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS documents_storage_key_key ON documents (storage_key) WHERE storage_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_customer_idx ON documents (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_business_idx ON documents (business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_application_idx ON documents (application_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents (status) WHERE deleted_at IS NULL;
