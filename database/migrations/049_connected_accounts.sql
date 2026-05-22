-- Migration 049: Connected email accounts
-- Stores OAuth tokens for Gmail and Outlook integrations.
-- Tokens are stored encrypted (AES-256-GCM via lib/encryption-v2.ts patterns).

CREATE TABLE IF NOT EXISTS connected_accounts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          TEXT        NOT NULL, -- 'gmail' | 'outlook'
  email             TEXT        NOT NULL,
  display_name      TEXT,
  access_token      TEXT        NOT NULL, -- encrypted
  refresh_token     TEXT,                 -- encrypted
  token_expires_at  TIMESTAMPTZ,
  scopes            TEXT[],
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  last_synced_at    TIMESTAMPTZ,
  sync_cursor       TEXT,       -- Gmail historyId or Outlook deltaLink
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider, email)
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_user
  ON connected_accounts (user_id, is_active);

-- Track which emails we've already imported (prevent duplicates)
CREATE TABLE IF NOT EXISTS email_sync_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID        NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  external_id       TEXT        NOT NULL, -- Gmail message ID or Outlook message ID
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_email_sync_log_account
  ON email_sync_log (account_id, imported_at DESC);
