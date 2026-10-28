DROP TABLE IF EXISTS app_settings;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS notifications;
DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
DROP FUNCTION IF EXISTS audit_logs_append_only();
DROP INDEX IF EXISTS audit_logs_occurred_idx;
DROP INDEX IF EXISTS audit_logs_entity_idx;
DROP INDEX IF EXISTS audit_logs_actor_idx;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS metadata, DROP COLUMN IF EXISTS ip_address;
DROP TABLE IF EXISTS auth_challenges;
DROP TABLE IF EXISTS webauthn_credentials;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS user_sessions;
DROP INDEX IF EXISTS customers_national_id_key;
DROP INDEX IF EXISTS customers_user_id_key;
DROP INDEX IF EXISTS customers_name_idx;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_segment_check;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_data_source_check;
ALTER TABLE customers
  DROP COLUMN IF EXISTS address, DROP COLUMN IF EXISTS date_of_birth, DROP COLUMN IF EXISTS gender,
  DROP COLUMN IF EXISTS employment_type, DROP COLUMN IF EXISTS employer_name, DROP COLUMN IF EXISTS monthly_income,
  DROP COLUMN IF EXISTS segment, DROP COLUMN IF EXISTS is_activated, DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS data_source;
DROP INDEX IF EXISTS users_email_lower_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_data_source_check;
ALTER TABLE users
  DROP COLUMN IF EXISTS phone, DROP COLUMN IF EXISTS staff_title, DROP COLUMN IF EXISTS approval_limit,
  DROP COLUMN IF EXISTS security_question, DROP COLUMN IF EXISTS security_answer_hash,
  DROP COLUMN IF EXISTS notification_prefs, DROP COLUMN IF EXISTS token_version,
  DROP COLUMN IF EXISTS password_changed_at, DROP COLUMN IF EXISTS failed_login_count,
  DROP COLUMN IF EXISTS locked_until, DROP COLUMN IF EXISTS last_login_at,
  DROP COLUMN IF EXISTS must_change_password, DROP COLUMN IF EXISTS data_source;
