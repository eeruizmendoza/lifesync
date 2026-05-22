-- Migration 040: Organization Audit Log
-- Security and compliance event trail per org.

CREATE TABLE IF NOT EXISTS org_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  actor_name  VARCHAR(100),                        -- denormalized for display even after user deletion
  event_type  VARCHAR(80) NOT NULL,                -- e.g. "api_key.created", "member.removed"
  target_type VARCHAR(40),                         -- e.g. "api_key", "member", "webhook"
  target_id   VARCHAR(100),                        -- id of the affected entity
  target_name VARCHAR(200),                        -- human-readable name of entity
  metadata    JSONB,                               -- extra context (IP, old role, etc.)
  created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_audit_log_org ON org_audit_log(org_id, created_at DESC);
