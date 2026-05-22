-- Migration 044: Rate Limit Tracking
-- Stores per-IP/per-user rate limit counters using a sliding window approach.
-- Rows auto-expire via periodic cleanup (or TTL index scan).

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        VARCHAR(200) NOT NULL,           -- e.g. "ip:1.2.3.4:send-code" or "uid:abc:calls"
  window_start TIMESTAMP NOT NULL,
  count      INT         NOT NULL DEFAULT 1,
  updated_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Unique index on (key, window_start) so we can UPSERT per window
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limit_key_window
  ON rate_limit_log(key, window_start);

-- Index for cleanup job (delete old windows)
CREATE INDEX IF NOT EXISTS idx_rate_limit_updated
  ON rate_limit_log(updated_at);
