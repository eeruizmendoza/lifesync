-- Migration 035: Add last_seen_at to users for presence tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at DESC) WHERE last_seen_at IS NOT NULL;
