-- Migration 047: Universal Messages Store
-- The foundation of LifeSync's unified communication hub.
-- Every channel (in-app chat, SMS, email, voice message, file, photo, room session)
-- is stored here. Calls live in conversations table and are merged at the API layer.

CREATE TYPE IF NOT EXISTS message_channel AS ENUM (
  'in_app_chat',    -- LifeSync ↔ LifeSync real-time chat
  'sms',            -- Two-way SMS via Twilio
  'voice_message',  -- Recorded audio message (not a live call)
  'email',          -- Gmail / Outlook integrated email
  'file',           -- Document / attachment shared
  'photo',          -- Photo or image shared
  'room_session'    -- Transcript from a Room Mode session
);

CREATE TYPE IF NOT EXISTS message_direction AS ENUM (
  'outbound',       -- current user sent
  'inbound'         -- current user received
);

CREATE TYPE IF NOT EXISTS message_status AS ENUM (
  'sending',
  'delivered',
  'read',
  'failed'
);

CREATE TABLE IF NOT EXISTS messages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who is involved
  sender_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  receiver_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  external_contact_id  UUID REFERENCES external_contacts(id) ON DELETE SET NULL,

  -- Org context (for future team inboxes)
  org_id               UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Channel + direction
  channel              message_channel NOT NULL,
  direction            message_direction NOT NULL,
  status               message_status NOT NULL DEFAULT 'delivered',

  -- Content
  content              TEXT,                         -- original text
  translated_content   TEXT,                         -- translated text (auto-filled)
  language             CHAR(5) DEFAULT 'en',          -- source language ISO code
  target_language      CHAR(5) DEFAULT 'en',          -- translation target language

  -- Media (files, photos, voice messages)
  media_url            TEXT,                         -- S3 key or public URL
  media_type           TEXT,                         -- MIME type
  media_size_bytes     BIGINT,
  media_name           TEXT,                         -- original filename

  -- External identifiers (for SMS/email sync)
  external_message_id  TEXT,                         -- Twilio SID, Gmail message ID, etc.
  thread_id            TEXT,                         -- email thread / SMS conversation

  -- Room session link
  room_session_id      UUID,                         -- links to future room_sessions table

  -- Conversation link (for messages tied to a call)
  conversation_id      UUID REFERENCES conversations(id) ON DELETE SET NULL,

  -- Metadata
  read_at              TIMESTAMPTZ,
  deleted_at           TIMESTAMPTZ,                  -- soft delete
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Timeline query: all messages involving a platform user, sorted by time
CREATE INDEX IF NOT EXISTS idx_messages_sender    ON messages(sender_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver  ON messages(receiver_user_id, created_at DESC);

-- Timeline query: messages to/from an external contact
CREATE INDEX IF NOT EXISTS idx_messages_external  ON messages(external_contact_id, created_at DESC);

-- Channel-specific queries
CREATE INDEX IF NOT EXISTS idx_messages_channel   ON messages(channel, created_at DESC);

-- Org inbox
CREATE INDEX IF NOT EXISTS idx_messages_org       ON messages(org_id, created_at DESC);

-- External ID dedup (SMS/email sync)
CREATE INDEX IF NOT EXISTS idx_messages_ext_id    ON messages(external_message_id) WHERE external_message_id IS NOT NULL;

-- Cleanup
CREATE INDEX IF NOT EXISTS idx_messages_deleted   ON messages(deleted_at) WHERE deleted_at IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messages_updated_at ON messages;
CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_messages_updated_at();
