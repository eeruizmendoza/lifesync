-- Migration 043: Pinned Contacts
-- Allows users to pin/favorite specific contacts for quick access.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fetching pinned contacts quickly
CREATE INDEX IF NOT EXISTS idx_contacts_pinned
  ON contacts(user_id, is_pinned)
  WHERE is_pinned = TRUE;
