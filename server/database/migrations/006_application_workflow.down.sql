DROP INDEX IF EXISTS payroll_records_customer_idx;
ALTER TABLE payroll_records DROP COLUMN IF EXISTS customer_id, DROP COLUMN IF EXISTS application_id,
  DROP COLUMN IF EXISTS transaction_id, DROP COLUMN IF EXISTS failure_reason;
ALTER TABLE payroll_batches DROP COLUMN IF EXISTS file_name, DROP COLUMN IF EXISTS uploaded_by, DROP COLUMN IF EXISTS status;
DROP TABLE IF EXISTS loan_transactions;
DROP INDEX IF EXISTS loan_installments_app_number_key;
DROP INDEX IF EXISTS loan_installments_due_idx;
DROP TABLE IF EXISTS loan_offers;
DROP TABLE IF EXISTS application_assessments;
DROP TABLE IF EXISTS application_events;
DROP INDEX IF EXISTS loan_applications_reference_key;
DROP INDEX IF EXISTS loan_applications_status_idx;
DROP INDEX IF EXISTS loan_applications_customer_idx;
DROP INDEX IF EXISTS loan_applications_business_idx;
DROP INDEX IF EXISTS loan_applications_product_idx;
DROP INDEX IF EXISTS loan_applications_officer_idx;
DROP INDEX IF EXISTS loan_applications_submitted_idx;
ALTER TABLE loan_applications DROP CONSTRAINT IF EXISTS loan_applications_status_check;
ALTER TABLE loan_applications DROP CONSTRAINT IF EXISTS loan_applications_borrower_type_check;
ALTER TABLE loan_applications DROP CONSTRAINT IF EXISTS loan_applications_business_borrower_check;
ALTER TABLE loan_applications DROP CONSTRAINT IF EXISTS loan_applications_recommendation_check;
ALTER TABLE loan_applications DROP CONSTRAINT IF EXISTS loan_applications_data_source_check;
ALTER TABLE loan_applications
  DROP COLUMN IF EXISTS reference, DROP COLUMN IF EXISTS product_id, DROP COLUMN IF EXISTS borrower_type,
  DROP COLUMN IF EXISTS business_id, DROP COLUMN IF EXISTS purpose, DROP COLUMN IF EXISTS interest_method,
  DROP COLUMN IF EXISTS product_snapshot, DROP COLUMN IF EXISTS applicant_declared,
  DROP COLUMN IF EXISTS assigned_officer_id, DROP COLUMN IF EXISTS assigned_by, DROP COLUMN IF EXISTS assigned_at,
  DROP COLUMN IF EXISTS submitted_at, DROP COLUMN IF EXISTS info_request_note, DROP COLUMN IF EXISTS recommendation,
  DROP COLUMN IF EXISTS recommendation_note, DROP COLUMN IF EXISTS recommended_by, DROP COLUMN IF EXISTS recommended_at,
  DROP COLUMN IF EXISTS decided_by, DROP COLUMN IF EXISTS decided_at, DROP COLUMN IF EXISTS decision_reason,
  DROP COLUMN IF EXISTS approved_amount, DROP COLUMN IF EXISTS approved_term_months, DROP COLUMN IF EXISTS withdrawn_at,
  DROP COLUMN IF EXISTS closed_at, DROP COLUMN IF EXISTS data_source;
DROP SEQUENCE IF EXISTS loan_application_reference_seq;
ALTER TABLE loan_applications ALTER COLUMN status SET DEFAULT 'Under Review';
