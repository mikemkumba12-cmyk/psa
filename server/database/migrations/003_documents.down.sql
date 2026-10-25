DROP INDEX IF EXISTS documents_storage_key_key;
DROP INDEX IF EXISTS documents_customer_idx;
DROP INDEX IF EXISTS documents_business_idx;
DROP INDEX IF EXISTS documents_application_idx;
DROP INDEX IF EXISTS documents_status_idx;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_owner_check;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_fkey;
ALTER TABLE documents
  DROP COLUMN IF EXISTS customer_id, DROP COLUMN IF EXISTS business_id, DROP COLUMN IF EXISTS application_id,
  DROP COLUMN IF EXISTS mime_type, DROP COLUMN IF EXISTS sha256, DROP COLUMN IF EXISTS storage_driver,
  DROP COLUMN IF EXISTS storage_key, DROP COLUMN IF EXISTS encrypted, DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS reviewed_by, DROP COLUMN IF EXISTS reviewed_at, DROP COLUMN IF EXISTS review_note,
  DROP COLUMN IF EXISTS expires_on, DROP COLUMN IF EXISTS replaces_document_id, DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS delete_reason, DROP COLUMN IF EXISTS data_source;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_uploaded_by_fkey;
ALTER TABLE documents RENAME COLUMN size_bytes TO size;
ALTER TABLE documents RENAME COLUMN document_type TO type;
ALTER TABLE documents RENAME COLUMN original_name TO name;
ALTER TABLE documents RENAME COLUMN uploaded_by TO user_id;
ALTER TABLE documents ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
DROP TABLE IF EXISTS document_types;
