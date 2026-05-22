-- Migration 042: Call Notes
-- Adds a free-text notes column to conversations so users can annotate calls
-- after they complete (action items, follow-ups, CRM notes).

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index for non-null notes (find calls that have notes quickly)
CREATE INDEX IF NOT EXISTS idx_conversations_notes_not_null
  ON conversations(id)
  WHERE notes IS NOT NULL;
