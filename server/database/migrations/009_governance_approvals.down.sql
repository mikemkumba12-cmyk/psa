DROP TRIGGER IF EXISTS governance_policy_versions_no_update_delete ON governance_policy_versions;
DROP FUNCTION IF EXISTS governance_policy_versions_append_only();
DROP TRIGGER IF EXISTS governance_change_events_no_update_delete ON governance_change_events;
DROP FUNCTION IF EXISTS governance_events_append_only();
DROP TRIGGER IF EXISTS governance_requests_protect_update_delete ON governance_change_requests;
DROP FUNCTION IF EXISTS governance_requests_protect();
DROP TABLE IF EXISTS governance_change_events;
DROP TABLE IF EXISTS governance_policy_versions;
DROP TABLE IF EXISTS governance_change_requests;
