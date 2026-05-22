-- Migration 038: Webhook Endpoints
-- Allows org admins to register HTTP endpoints for real-time event delivery.
-- Signed with HMAC-SHA256 using a per-endpoint secret.

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url           TEXT        NOT NULL,
  description   VARCHAR(200),
  events        TEXT[]      NOT NULL DEFAULT '{}',   -- e.g. {"call.completed","recording.ready"}
  secret        VARCHAR(64) NOT NULL,                 -- HMAC-SHA256 signing secret (stored plaintext, shown once)
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  last_triggered_at  TIMESTAMP,
  last_status_code   INT,
  failure_count      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org ON webhook_endpoints(org_id) WHERE is_active = TRUE;

-- Delivery log for audit trail and retry visibility
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id   UUID        NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  org_id        UUID        NOT NULL,
  event_type    VARCHAR(60) NOT NULL,
  payload       JSONB       NOT NULL,
  status_code   INT,
  response_body TEXT,
  duration_ms   INT,
  delivered_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
  success       BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id, delivered_at DESC);
