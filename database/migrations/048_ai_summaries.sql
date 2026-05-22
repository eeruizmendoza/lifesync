-- Migration 048: AI Communication Summaries
-- Adds structured AI summary fields to conversations (calls)
-- and a contact_summaries table for chat/timeline thread summaries.

-- ── 1. Add ai_summary columns to conversations ──────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_summary       JSONB,
  ADD COLUMN IF NOT EXISTS ai_summary_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_summary_model TEXT;

-- Index for fetching unsummarized calls
CREATE INDEX IF NOT EXISTS idx_conversations_ai_summary
  ON conversations (user_id, created_at DESC)
  WHERE ai_summary IS NULL AND deleted_at IS NULL;

-- ── 2. Contact summaries table (chat / timeline thread) ────────────────────
CREATE TABLE IF NOT EXISTS contact_summaries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id   UUID        REFERENCES users(id) ON DELETE CASCADE,
  external_contact_id UUID      REFERENCES external_contacts(id) ON DELETE CASCADE,
  summary           JSONB       NOT NULL,
  last_message_id   UUID,
  message_count     INT         NOT NULL DEFAULT 0,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model             TEXT,
  CONSTRAINT contact_summaries_contact_check
    CHECK (contact_user_id IS NOT NULL OR external_contact_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_contact_summaries_user
  ON contact_summaries (user_id, generated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_summaries_unique
  ON contact_summaries (user_id, contact_user_id)
  WHERE contact_user_id IS NOT NULL;
