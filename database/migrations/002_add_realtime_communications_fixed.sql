-- Migration 002: Add Real-Time Communications Tables (Fixed for Neon PostgreSQL)
-- Purpose: Foundation for real-time translation, calls, and encrypted conversations
-- Date: 2026-05-21

-- Enable necessary extensions (pgvector not available on Neon free tier)
-- CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CONVERSATIONS TABLE
-- Metadata about all conversations (calls, messages, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_phone VARCHAR(20),
  recipient_email VARCHAR(255),

  -- Type of conversation
  conversation_type VARCHAR(50) NOT NULL DEFAULT 'phone_call', -- 'phone_call', 'video_call', 'sms', 'email', 'in_person'

  -- Languages involved
  source_language VARCHAR(10) NOT NULL DEFAULT 'en', -- 'es', 'zh', 'en', etc.
  target_language VARCHAR(10) NOT NULL DEFAULT 'en',
  language_pair VARCHAR(10) NOT NULL, -- 'es_zh', 'en_de', etc. (for quick lookup)

  -- Call status
  status VARCHAR(50) NOT NULL DEFAULT 'initiated', -- 'initiated', 'ringing', 'active', 'ended', 'failed'

  -- Encryption status
  is_encrypted BOOLEAN DEFAULT true,
  encryption_algorithm VARCHAR(50) DEFAULT 'XChaCha20-Poly1305',

  -- Metadata
  duration_seconds INT DEFAULT 0,
  participant_count INT DEFAULT 2,

  -- Tracking
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  ended_at TIMESTAMP,
  last_message_at TIMESTAMP,
  deleted_at TIMESTAMP -- Soft delete

  CONSTRAINT check_language_pair CHECK (language_pair ~ '^[a-z]{2}_[a-z]{2}$')
);

CREATE INDEX IF NOT EXISTS idx_conversations_initiator_id ON conversations(initiator_id);
CREATE INDEX IF NOT EXISTS idx_conversations_recipient_id ON conversations(recipient_id);
CREATE INDEX IF NOT EXISTS idx_conversations_conversation_type ON conversations(conversation_type);
CREATE INDEX IF NOT EXISTS idx_conversations_language_pair ON conversations(language_pair);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

-- ============================================================================
-- CONVERSATION RECORDINGS TABLE
-- Stores encrypted audio and video files for conversations
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Recording file storage
  recording_type VARCHAR(50) NOT NULL DEFAULT 'audio', -- 'audio', 'video', 'screen_share'
  s3_key TEXT, -- Path to encrypted file in S3
  mime_type VARCHAR(100), -- audio/webm, video/webm, etc.
  file_size_bytes BIGINT,
  duration_seconds INT,

  -- Encryption metadata
  is_encrypted BOOLEAN DEFAULT true,
  encryption_algorithm VARCHAR(50) DEFAULT 'XChaCha20-Poly1305',
  encryption_key_id UUID, -- Reference to key used

  -- Quality metrics
  audio_bitrate_kbps INT,
  video_bitrate_kbps INT,
  sample_rate_hz INT,
  channels INT,
  video_resolution VARCHAR(20), -- '1080p', '720p', etc.
  frame_rate INT,

  -- Processing status
  processing_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'complete', 'failed'
  transcription_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'complete', 'failed'

  -- Timestamps
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversation_recordings_conversation_id ON conversation_recordings(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_recordings_user_id ON conversation_recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_recordings_processing_status ON conversation_recordings(processing_status);
CREATE INDEX IF NOT EXISTS idx_conversation_recordings_created_at ON conversation_recordings(created_at DESC);

-- ============================================================================
-- CONVERSATION TRANSCRIPTS TABLE
-- Stores original and translated text from conversations
-- One row per speaker per sentence/phrase
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  speaker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Transcription content
  original_text TEXT NOT NULL, -- Speaker's original language
  translated_text TEXT, -- Translated to recipient's language
  source_language VARCHAR(10) NOT NULL,
  target_language VARCHAR(10) NOT NULL,

  -- Quality metrics
  confidence DECIMAL(3,2), -- 0.00 to 1.00 confidence score
  word_count INT,
  speaker_role VARCHAR(50), -- 'initiator', 'recipient'

  -- Encryption
  is_encrypted BOOLEAN DEFAULT true,
  encryption_algorithm VARCHAR(50) DEFAULT 'XChaCha20-Poly1305',
  encrypted_audio BYTEA, -- Encrypted audio chunk

  -- Timing
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  duration_seconds DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_transcripts_conversation_id ON conversation_transcripts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_transcripts_speaker_id ON conversation_transcripts(speaker_id);
CREATE INDEX IF NOT EXISTS idx_conversation_transcripts_source_language ON conversation_transcripts(source_language);
CREATE INDEX IF NOT EXISTS idx_conversation_transcripts_target_language ON conversation_transcripts(target_language);
CREATE INDEX IF NOT EXISTS idx_conversation_transcripts_created_at ON conversation_transcripts(created_at);

-- ============================================================================
-- CONVERSATION PARTICIPANTS TABLE
-- For future group conversations
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language_preference VARCHAR(10), -- This participant's language
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);

-- ============================================================================
-- ENCRYPTION KEYS TABLE
-- Store encryption key metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_type VARCHAR(50) NOT NULL, -- 'conversation', 'recording', 'transport'
  algorithm VARCHAR(50) NOT NULL DEFAULT 'XChaCha20-Poly1305',
  is_active BOOLEAN DEFAULT true,
  rotation_count INT DEFAULT 0,
  last_rotated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_encryption_keys_user_id ON encryption_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_is_active ON encryption_keys(is_active);
