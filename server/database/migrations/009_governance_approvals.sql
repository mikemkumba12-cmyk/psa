-- Sensitive access and institutional policy changes require independent approval.
CREATE TABLE governance_change_requests (
  id VARCHAR(100) PRIMARY KEY,
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('access', 'setting', 'product', 'staff_create')),
  entity_id VARCHAR(100) NOT NULL,
  requested_by VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL,
  previous_value JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by VARCHAR(100) REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT governance_change_independent_review CHECK (reviewed_by IS NULL OR reviewed_by <> requested_by),
  CONSTRAINT governance_change_decision_fields CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX governance_change_one_pending_per_entity
  ON governance_change_requests (change_type, entity_id) WHERE status = 'pending';
CREATE INDEX governance_change_queue_idx ON governance_change_requests (status, created_at DESC);

CREATE OR REPLACE FUNCTION governance_requests_protect() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'governance change requests cannot be deleted';
  END IF;
  IF OLD.status <> 'pending' OR NEW.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'governance requests can only be decided once';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.change_type IS DISTINCT FROM OLD.change_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.previous_value IS DISTINCT FROM OLD.previous_value
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'governance request details are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER governance_requests_protect_update_delete
  BEFORE UPDATE OR DELETE ON governance_change_requests
  FOR EACH ROW EXECUTE FUNCTION governance_requests_protect();

CREATE TABLE governance_policy_versions (
  setting_key VARCHAR(100) NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  value JSONB NOT NULL,
  change_request_id VARCHAR(100) UNIQUE REFERENCES governance_change_requests(id) ON DELETE RESTRICT,
  requested_by VARCHAR(100) REFERENCES users(id) ON DELETE RESTRICT,
  approved_by VARCHAR(100) REFERENCES users(id) ON DELETE RESTRICT,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (setting_key, version),
  CONSTRAINT governance_policy_independent_approval CHECK (
    (requested_by IS NULL AND approved_by IS NULL)
    OR (requested_by IS NOT NULL AND approved_by IS NOT NULL AND requested_by <> approved_by)
  )
);

CREATE TABLE governance_change_events (
  id BIGSERIAL PRIMARY KEY,
  request_id VARCHAR(100) NOT NULL REFERENCES governance_change_requests(id) ON DELETE RESTRICT,
  actor_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('submitted', 'approved', 'rejected')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX governance_change_events_request_idx ON governance_change_events (request_id, created_at);

CREATE OR REPLACE FUNCTION governance_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'governance_change_events is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER governance_change_events_no_update_delete
  BEFORE UPDATE OR DELETE ON governance_change_events
  FOR EACH ROW EXECUTE FUNCTION governance_events_append_only();

CREATE OR REPLACE FUNCTION governance_policy_versions_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'governance_policy_versions is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER governance_policy_versions_no_update_delete
  BEFORE UPDATE OR DELETE ON governance_policy_versions
  FOR EACH ROW EXECUTE FUNCTION governance_policy_versions_append_only();

-- Record the currently active institutional policies as the baseline version.
INSERT INTO governance_policy_versions (setting_key, version, value)
SELECT s.key, 1, s.value
  FROM app_settings s
 WHERE s.key IN ('membership_policy', 'assessment_thresholds', 'workflow', 'branding')
ON CONFLICT DO NOTHING;
