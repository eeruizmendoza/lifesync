-- Migration 033: Add language_preference to users table
-- Allows users to set their preferred language for calls and translations

ALTER TABLE users ADD COLUMN IF NOT EXISTS language_preference VARCHAR(10) DEFAULT 'en';
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_calls BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_invites BOOLEAN DEFAULT true;

-- Index for language-based lookups (e.g., find users who speak Spanish)
CREATE INDEX IF NOT EXISTS idx_users_language ON users(language_preference);

-- Update users who had language_preference set in conversation_participants
-- to carry that preference over to their profile (best-effort, on conflict use default)
UPDATE users u
SET language_preference = (
  SELECT cp.language_preference
  FROM conversation_participants cp
  WHERE cp.user_id = u.id
    AND cp.language_preference IS NOT NULL
  ORDER BY cp.joined_at DESC
  LIMIT 1
)
WHERE u.language_preference IS NULL OR u.language_preference = 'en';
