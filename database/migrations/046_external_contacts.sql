-- Migration 046: External Contacts
-- Contacts for non-platform users (homeowners, adjusters, contractors, etc.)
-- Supports personal contacts (owner only) and org-shared (all org members).

CREATE TABLE IF NOT EXISTS external_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_org_shared   BOOLEAN NOT NULL DEFAULT FALSE,
  name            VARCHAR(255) NOT NULL,
  phone           VARCHAR(50),
  email           VARCHAR(255),
  company         VARCHAR(255),
  language        VARCHAR(10) NOT NULL DEFAULT 'en',
  tags            TEXT[] NOT NULL DEFAULT '{}',
  notes           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMP
);

-- List org-shared contacts efficiently
CREATE INDEX IF NOT EXISTS idx_external_contacts_org
  ON external_contacts(org_id, is_org_shared)
  WHERE deleted_at IS NULL;

-- List personal contacts efficiently
CREATE INDEX IF NOT EXISTS idx_external_contacts_owner
  ON external_contacts(owner_user_id)
  WHERE deleted_at IS NULL;

-- Tag-based filtering
CREATE INDEX IF NOT EXISTS idx_external_contacts_tags
  ON external_contacts USING GIN(tags)
  WHERE deleted_at IS NULL;
