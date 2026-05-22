-- Migration 037: API Key Management
-- Allows org admins to create programmatic API keys for developer integrations

CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  key_prefix    VARCHAR(20) NOT NULL,           -- e.g. "ls_live_Ab3d" — shown in UI
  key_hash      VARCHAR(64) NOT NULL UNIQUE,    -- SHA-256 of full key — never store plain
  last_used_at  TIMESTAMP,
  expires_at    TIMESTAMP,                      -- NULL = never expires
  revoked_at    TIMESTAMP,
  created_at    TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org_id   ON api_keys(org_id)   WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
