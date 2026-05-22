-- Migration 036: User notifications table
-- Stores in-app notifications for missed calls, member joins, quota warnings

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  -- types: missed_call | member_joined | quota_warning | system
  title VARCHAR(255) NOT NULL,
  body TEXT,
  link VARCHAR(500),
  -- optional deep-link into the app
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user
  ON user_notifications(user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON user_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
