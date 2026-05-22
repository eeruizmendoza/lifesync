-- Migration 045: Call Follow-up Reminders
-- Adds follow_up_at timestamp to conversations so users can schedule
-- a reminder to follow up after a call.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMP;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS follow_up_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for daily job: find reminders due today
CREATE INDEX IF NOT EXISTS idx_conversations_followup
  ON conversations(follow_up_at, follow_up_sent)
  WHERE follow_up_at IS NOT NULL AND follow_up_sent = FALSE;
