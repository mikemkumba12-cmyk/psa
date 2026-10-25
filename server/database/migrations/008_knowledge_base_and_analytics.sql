-- Migration 008: approved knowledge base for the assistant, assistant diagnostics, and portfolio history.

-- ── Knowledge base (retrieval over approved institutional material) ─────────
CREATE TABLE IF NOT EXISTS kb_documents (
  id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('institution_policy', 'product_information', 'faq', 'public_website', 'financial_education')),
  source_reference TEXT,
  visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'staff')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  body TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  approved_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id VARCHAR(100) PRIMARY KEY,
  document_id VARCHAR(100) NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  position INT NOT NULL,
  heading VARCHAR(255),
  content TEXT NOT NULL,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(heading, '')), 'A') || setweight(to_tsvector('english', content), 'B')
  ) STORED
);
CREATE INDEX IF NOT EXISTS kb_chunks_search_idx ON kb_chunks USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS kb_chunks_document_idx ON kb_chunks (document_id, position);

-- Diagnostics only: questions are stored with numbers masked, never with document contents.
CREATE TABLE IF NOT EXISTS assistant_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  user_role VARCHAR(30),
  intent VARCHAR(50) NOT NULL,
  question_masked TEXT NOT NULL,
  answered BOOLEAN NOT NULL,
  source_ids TEXT[] NOT NULL DEFAULT '{}',
  used_model BOOLEAN NOT NULL DEFAULT FALSE,
  model_rejected BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms INT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_logs_created_idx ON assistant_logs (created_at DESC);

-- ── Portfolio history (daily snapshot written by a background job) ──────────
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  snapshot_date DATE NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  active_loans INT NOT NULL,
  outstanding_principal NUMERIC(17,2) NOT NULL,
  outstanding_total NUMERIC(17,2) NOT NULL,
  arrears_amount NUMERIC(17,2) NOT NULL,
  principal_at_risk_30 NUMERIC(17,2) NOT NULL,
  loans_in_arrears INT NOT NULL,
  includes_demo_data BOOLEAN NOT NULL DEFAULT FALSE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, product_id)
);

-- Supports date-range analytics on transactions and decisions.
CREATE INDEX IF NOT EXISTS loan_transactions_confirmed_idx ON loan_transactions (type, value_date) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS loan_applications_decided_idx ON loan_applications (decided_at) WHERE decided_at IS NOT NULL;

-- ── Seed: summaries of Pinnacle's public guidance (approved for public answers) ──
-- Written as short summaries of pinnacle.co.mw pages (reviewed 2026-10-25), not copies.
INSERT INTO kb_documents (id, title, source_type, source_reference, visibility, status, body, approved_at) VALUES
  ('kb_responsible_lending', 'Responsible lending at Pinnacle', 'public_website',
   'https://pinnacle.co.mw/news/responsible-lending-at-pinnacle', 'public', 'approved',
   E'## Affordability\nBefore a loan is approved, Pinnacle checks whether the customer can comfortably repay. For payroll customers this looks at income, existing deductions and repayment comfort. For SME customers it looks at revenue, bank statements, contracts, collateral and what the funding is for.\n\n## Transparency\nFees, charges and repayment expectations are explained before you commit.\n\n## Borrow what you can repay\nCustomers are encouraged to ask questions, compare options and borrow only what they can reasonably repay.',
   now()),
  ('kb_sme_documents', 'Documents for SME finance', 'public_website',
   'https://pinnacle.co.mw/news/sme-working-capital-guide', 'public', 'approved',
   E'## Typical documents\nSME applications typically need business registration documents, a valid national ID, an MRA tax clearance certificate, bank statements, and security documents where applicable. The exact list for each product is shown in the application form.\n\n## Choosing a product\nWorking capital finance supports day-to-day operations. Invoice discounting releases cash tied up in confirmed invoices. Order financing helps fulfil orders a business has already won.',
   now()),
  ('kb_about', 'About Pinnacle Financial Services', 'public_website', 'https://pinnacle.co.mw', 'public', 'approved',
   E'## Who we are\nPinnacle Financial Services Limited is licensed by the Reserve Bank of Malawi (NDMFI 014/19).\n\n## Contact\nToll free 4301, phone or WhatsApp +265 990 672 924, email info@pinnacle.co.mw. Offices are in Lilongwe (City Centre and Area 3), Blantyre and Mzuzu.',
   now())
ON CONFLICT (id) DO NOTHING;
