-- Migration 002: Add Real-Time Communications Tables
-- Purpose: Foundation for real-time translation, calls, and encrypted conversations
-- Date: 2026-05-21

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CONVERSATIONS TABLE
-- Metadata about all conversations (calls, messages, etc.)
-- ============================================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES users(id) ON DELETE SET NULL,
  contact_phone VARCHAR(20),
  contact_email VARCHAR(255),

  -- Type of conversation
  conversation_type VARCHAR(50) NOT NULL, -- 'phone_call', 'video_call', 'sms', 'email', 'in_person'

  -- Languages involved
  user_language VARCHAR(10) NOT NULL DEFAULT 'en', -- 'es', 'zh', 'en', etc.
  contact_language VARCHAR(10) NOT NULL DEFAULT 'en',
  language_pair VARCHAR(10) NOT NULL, -- 'es_zh', 'en_de', etc. (for quick lookup)

  -- Encryption status
  is_encrypted BOOLEAN DEFAULT true,
  encryption_algorithm VARCHAR(50) DEFAULT 'XChaCha20-Poly1305',

  -- Metadata
  duration_seconds INT DEFAULT 0,
  participant_count INT DEFAULT 2,

  -- Tracking
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_message_at TIMESTAMP,
  deleted_at TIMESTAMP, -- Soft delete

  -- Indexes for fast lookup
  INDEX idx_user_id (user_id),
  INDEX idx_contact_id (contact_id),
  INDEX idx_conversation_type (conversation_type),
  INDEX idx_language_pair (language_pair),
  INDEX idx_created_at (created_at DESC),
  CONSTRAINT check_language_pair CHECK (language_pair ~ '^[a-z]{2}_[a-z]{2}$')
);

-- ============================================================================
-- CONVERSATION RECORDINGS TABLE
-- Stores encrypted audio and video files for conversations
-- ============================================================================
CREATE TABLE conversation_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Recording file storage
  recording_type VARCHAR(50) NOT NULL, -- 'audio', 'video', 'screen_share'
  s3_url TEXT, -- Path to encrypted file in S3
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
  deleted_at TIMESTAMP,

  INDEX idx_conversation_id (conversation_id),
  INDEX idx_user_id (user_id),
  INDEX idx_processing_status (processing_status),
  INDEX idx_created_at (created_at DESC)
);

-- ============================================================================
-- CONVERSATION TRANSCRIPTS TABLE
-- Stores original and translated text from conversations
-- One row per speaker per sentence/phrase
-- ============================================================================
CREATE TABLE conversation_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  recording_id UUID REFERENCES conversation_recordings(id) ON DELETE SET NULL,

  speaker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Original text (encrypted)
  original_text_encrypted TEXT NOT NULL,
  original_language VARCHAR(10) NOT NULL,

  -- Translated text (encrypted)
  translated_text_encrypted TEXT NOT NULL,
  translated_language VARCHAR(10) NOT NULL,

  -- Speech-to-text confidence
  transcription_confidence DECIMAL(3,2), -- 0.00 to 1.00

  -- Translation quality
  translation_confidence DECIMAL(3,2), -- BLEU score
  translation_provider VARCHAR(50), -- 'deepl', 'seamless', 'argos', etc.

  -- Timing information
  timestamp_ms INT NOT NULL, -- Offset from start of conversation
  duration_ms INT, -- How long speaker spoke

  -- Semantic information for search
  original_text_hash TEXT, -- SHA-256 hash for searchable encryption
  sentiment_score DECIMAL(3,2), -- -1.0 to 1.0
  intent_classification VARCHAR(100), -- 'greeting', 'question', 'statement', etc.

  -- AI metadata
  entities JSONB, -- Named entities: { "person": ["John"], "place": ["Paris"] }
  keywords TEXT[], -- For search indexing

  -- Speech embeddings (pgvector) for semantic search
  speech_embedding vector(384), -- Sentence embedding

  -- User corrections
  is_manual_correction BOOLEAN DEFAULT false,
  corrected_by_user_id UUID REFERENCES users(id),
  corrected_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,

  INDEX idx_conversation_id (conversation_id),
  INDEX idx_recording_id (recording_id),
  INDEX idx_speaker_user_id (speaker_user_id),
  INDEX idx_timestamp_ms (timestamp_ms),
  INDEX idx_sentiment (sentiment_score),
  INDEX idx_speech_embedding ON conversation_transcripts USING ivfflat (speech_embedding vector_cosine_ops),
  CONSTRAINT check_language CHECK (original_language ~ '^[a-z]{2}$'),
  CONSTRAINT check_confidence CHECK (transcription_confidence >= 0 AND transcription_confidence <= 1)
);

-- ============================================================================
-- TRANSLATION CACHE TABLE
-- Caches translations to avoid re-translating same phrases
-- ============================================================================
CREATE TABLE translation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Source text hash (don't store plaintext)
  source_text_hash TEXT NOT NULL, -- SHA-256
  source_language VARCHAR(10) NOT NULL,
  target_language VARCHAR(10) NOT NULL,

  -- Encrypted translation
  translated_text_encrypted TEXT NOT NULL,

  -- Metadata
  translation_provider VARCHAR(50), -- 'deepl', 'seamless', 'argos'
  quality_score DECIMAL(3,2),

  -- Tracking
  hit_count INT DEFAULT 0,
  last_accessed TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),

  INDEX idx_source_hash (source_text_hash),
  INDEX idx_language_pair (source_language, target_language),
  INDEX idx_expires_at (expires_at),
  UNIQUE (source_text_hash, target_language)
);

-- ============================================================================
-- CONVERSATION PARTICIPANTS TABLE
-- For group calls and multi-party conversations
-- ============================================================================
CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Participation details
  participant_role VARCHAR(50) DEFAULT 'participant', -- 'initiator', 'participant', 'moderator'
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,

  -- Audio/video settings
  audio_enabled BOOLEAN DEFAULT true,
  video_enabled BOOLEAN DEFAULT false,
  screen_sharing BOOLEAN DEFAULT false,

  -- Translation settings per participant
  translation_enabled BOOLEAN DEFAULT true,
  preferred_language VARCHAR(10),

  -- Audio level (for detection of who's speaking)
  current_audio_level INT, -- 0-100
  is_speaking BOOLEAN DEFAULT false,

  -- Metadata
  client_info JSONB, -- Browser, OS, etc.
  network_quality VARCHAR(50), -- 'excellent', 'good', 'poor'
  latency_ms INT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_conversation_id (conversation_id),
  INDEX idx_user_id (user_id),
  UNIQUE (conversation_id, user_id)
);

-- ============================================================================
-- CONVERSATION ANNOTATIONS TABLE
-- User notes, bookmarks, and markers within conversations
-- ============================================================================
CREATE TABLE conversation_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Annotation type
  annotation_type VARCHAR(50) NOT NULL, -- 'note', 'bookmark', 'important', 'question', 'action_item'

  -- Where in the conversation
  timestamp_ms INT, -- Milliseconds into conversation (for audio/video)
  transcript_id UUID REFERENCES conversation_transcripts(id) ON DELETE SET NULL,

  -- Content (encrypted)
  content_encrypted TEXT,

  -- Who it's relevant to
  relevant_user_ids UUID[],

  -- Status
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'resolved', 'archived'

  -- Metadata
  priority INT DEFAULT 0, -- 0-5, higher = more important
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,

  INDEX idx_conversation_id (conversation_id),
  INDEX idx_annotation_type (annotation_type),
  INDEX idx_status (status),
  INDEX idx_timestamp_ms (timestamp_ms)
);

-- ============================================================================
-- ENCRYPTION KEYS TABLE
-- Stores per-conversation encryption keys (optional, for additional security)
-- ============================================================================
CREATE TABLE encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What this key encrypts
  key_type VARCHAR(50) NOT NULL, -- 'conversation', 'recording', 'user'
  key_scope_id UUID NOT NULL, -- conversation_id, recording_id, or user_id

  -- The encrypted key
  encrypted_key_material TEXT NOT NULL, -- Encrypted with server master key

  -- Key parameters
  algorithm VARCHAR(50) DEFAULT 'XChaCha20-Poly1305',
  key_length_bits INT DEFAULT 256,
  salt_hex TEXT NOT NULL,

  -- Rotation tracking
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  previous_key_id UUID REFERENCES encryption_keys(id),

  -- Audit trail
  created_at TIMESTAMP DEFAULT NOW(),
  rotated_at TIMESTAMP,
  expires_at TIMESTAMP,

  INDEX idx_key_scope_id (key_scope_id),
  INDEX idx_key_type (key_type),
  INDEX idx_is_active (is_active),
  CONSTRAINT check_key_type CHECK (key_type IN ('conversation', 'recording', 'user'))
);

-- ============================================================================
-- CALL QUALITY METRICS TABLE
-- Tracks network and quality metrics during calls
-- ============================================================================
CREATE TABLE call_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Network metrics
  latency_ms INT,
  jitter_ms INT,
  packet_loss_percent DECIMAL(5,2),
  bandwidth_available_kbps INT,
  bandwidth_used_kbps INT,

  -- Audio metrics
  audio_sample_rate INT,
  audio_bit_depth INT,
  audio_quality_score DECIMAL(3,1), -- MOS score: 0-5
  noise_level_db INT,

  -- Video metrics
  video_resolution VARCHAR(20),
  video_frame_rate INT,
  video_quality_score DECIMAL(3,1), -- 0-5
  video_bitrate_kbps INT,

  -- Overall
  overall_call_quality VARCHAR(50), -- 'excellent', 'good', 'fair', 'poor'

  -- Timestamp (metric at specific point in time)
  metric_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_conversation_id (conversation_id),
  INDEX idx_metric_timestamp (metric_timestamp)
);

-- ============================================================================
-- SPEECH EVENTS TABLE
-- Tracks speech boundaries and speaker turns
-- ============================================================================
CREATE TABLE speech_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  recording_id UUID REFERENCES conversation_recordings(id) ON DELETE SET NULL,
  speaker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Speech timing
  start_timestamp_ms INT NOT NULL,
  end_timestamp_ms INT NOT NULL,
  duration_ms INT GENERATED ALWAYS AS (end_timestamp_ms - start_timestamp_ms) STORED,

  -- Audio characteristics
  audio_level INT, -- 0-100
  speaking_pace INT, -- words per minute (estimated)

  -- Speaker info
  voice_characteristics JSONB, -- pitch, tone, etc. (for ML)

  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_conversation_id (conversation_id),
  INDEX idx_speaker_user_id (speaker_user_id),
  INDEX idx_timing (start_timestamp_ms, end_timestamp_ms)
);

-- ============================================================================
-- Create function to auto-update updated_at timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_recordings_updated_at
BEFORE UPDATE ON conversation_recordings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_transcripts_updated_at
BEFORE UPDATE ON conversation_transcripts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_participants_updated_at
BEFORE UPDATE ON conversation_participants
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_annotations_updated_at
BEFORE UPDATE ON conversation_annotations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_encryption_keys_updated_at
BEFORE UPDATE ON encryption_keys
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Create function to auto-delete expired translation cache entries
-- ============================================================================
CREATE OR REPLACE FUNCTION delete_expired_translations()
RETURNS void AS $$
BEGIN
  DELETE FROM translation_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INDEXES FOR COMMON QUERIES
-- ============================================================================

-- Fast lookup of conversations for a user
CREATE INDEX idx_conversations_user_created ON conversations(user_id, created_at DESC)
WHERE deleted_at IS NULL;

-- Fast lookup of unread conversations
CREATE INDEX idx_conversations_unread ON conversations(user_id, last_message_at DESC)
WHERE deleted_at IS NULL AND last_message_at IS NOT NULL;

-- Fast lookup of recordings for a conversation
CREATE INDEX idx_recordings_conversation_created ON conversation_recordings(conversation_id, created_at DESC)
WHERE deleted_at IS NULL;

-- Fast lookup of transcripts for a conversation
CREATE INDEX idx_transcripts_conversation_timestamp ON conversation_transcripts(conversation_id, timestamp_ms)
WHERE deleted_at IS NULL;

-- Fast search for conversations by language pair
CREATE INDEX idx_conversations_language_pair ON conversations(user_id, language_pair)
WHERE deleted_at IS NULL;

-- ============================================================================
-- Verify tables were created
-- ============================================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
