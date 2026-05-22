-- Migration 041: Contact Tags & Notes
-- Adds tags (role-based categories) and notes to contacts.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags       TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes      TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company    VARCHAR(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10);

-- Index for tag-based filtering
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN(tags);
