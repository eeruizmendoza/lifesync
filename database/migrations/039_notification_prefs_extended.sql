-- Migration 039: Extended Notification Preferences
-- Add quota warnings and weekly digest email toggles

ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_quota  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_digest BOOLEAN NOT NULL DEFAULT TRUE;
