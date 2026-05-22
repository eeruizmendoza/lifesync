/**
 * Migration 024: Add API Service Tables
 *
 * Creates tables for:
 * - Translation caching (for fast lookup of repeated translations)
 * - TTS logging (for analytics and quality monitoring)
 * - Provider health status (for tracking provider availability)
 *
 * Run date: 2026-05-21
 */

-- ============================================================================
-- Translation Cache Table
-- ============================================================================
-- Stores recent translations to avoid re-translating the same text
-- Automatically cleaned up after 1 hour

CREATE TABLE IF NOT EXISTS translation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source text fingerprint (SHA-256 hash)
  source_text_hash VARCHAR(64) NOT NULL,

  -- Language pair
  source_language VARCHAR(10) NOT NULL,
  target_language VARCHAR(10) NOT NULL,

  -- Translated content
  translated_text TEXT NOT NULL,

  -- Provider metadata
  provider VARCHAR(100) NOT NULL,  -- DeepL-v3, Meta-Seamless-M4T-v2, etc.
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.90,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),

  -- Unique constraint: prevent duplicate cache entries
  CONSTRAINT unique_translation UNIQUE(source_text_hash, source_language, target_language)
);

CREATE INDEX idx_translation_cache_lookup
  ON translation_cache(source_text_hash, source_language, target_language);
CREATE INDEX idx_translation_cache_expires
  ON translation_cache(expires_at);

-- ============================================================================
-- TTS Logs Table
-- ============================================================================
-- Logs all text-to-speech synthesis requests for analytics and monitoring

CREATE TABLE IF NOT EXISTS tts_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to conversation
  call_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Input metadata
  text_length INT NOT NULL,
  language VARCHAR(10) NOT NULL,
  voice_id VARCHAR(100) NOT NULL,

  -- Performance metadata
  provider VARCHAR(100) NOT NULL,  -- ElevenLabs-v3, Piper-TTS, etc.
  duration_ms INT NOT NULL,  -- Audio duration in milliseconds
  processing_time_ms INT NOT NULL,  -- API response time

  -- Quality metrics
  quality_score DECIMAL(3,2),  -- User-rated quality (1-5)

  -- Timestamp
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tts_logs_call
  ON tts_logs(call_id);
CREATE INDEX idx_tts_logs_user
  ON tts_logs(user_id);
CREATE INDEX idx_tts_logs_provider
  ON tts_logs(provider);
CREATE INDEX idx_tts_logs_created
  ON tts_logs(created_at DESC);

-- ============================================================================
-- Transcription Cache Table (if not exists from previous migration)
-- ============================================================================
-- Stores transcriptions for 90 days for compliance

CREATE TABLE IF NOT EXISTS transcription_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to conversation
  call_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Input metadata
  language VARCHAR(10) NOT NULL,
  audio_length_ms INT NOT NULL,

  -- Transcription result
  provider VARCHAR(100) NOT NULL,  -- Deepgram-Nova-2, OpenAI-Whisper-v3
  confidence DECIMAL(3,2) NOT NULL,
  word_count INT,

  -- Performance
  processing_time_ms INT NOT NULL,

  -- Timestamp
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '90 days')
);

CREATE INDEX idx_transcription_logs_call
  ON transcription_logs(call_id);
CREATE INDEX idx_transcription_logs_user
  ON transcription_logs(user_id);
CREATE INDEX idx_transcription_logs_provider
  ON transcription_logs(provider);
CREATE INDEX idx_transcription_logs_created
  ON transcription_logs(created_at DESC);

-- ============================================================================
-- Provider Health Status Table
-- ============================================================================
-- Tracks health/availability of third-party providers

CREATE TABLE IF NOT EXISTS provider_health_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider identification
  provider_name VARCHAR(100) NOT NULL,
  provider_type VARCHAR(50) NOT NULL,  -- 'transcription', 'translation', 'tts'

  -- Health metrics
  last_check_at TIMESTAMP NOT NULL DEFAULT NOW(),
  is_healthy BOOLEAN NOT NULL DEFAULT true,
  latency_ms INT,
  error_count_last_hour INT DEFAULT 0,
  success_rate DECIMAL(3,2) DEFAULT 1.00,

  -- Error tracking
  last_error_message TEXT,

  -- Timestamp
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_provider_health_unique
  ON provider_health_status(provider_name, provider_type);
CREATE INDEX idx_provider_health_status
  ON provider_health_status(provider_type, is_healthy);

-- ============================================================================
-- API Usage Quota Table
-- ============================================================================
-- Tracks API usage against quotas for cost management

CREATE TABLE IF NOT EXISTS api_usage_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and provider
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name VARCHAR(100) NOT NULL,

  -- Usage tracking
  calls_this_month INT DEFAULT 0,
  characters_this_month INT DEFAULT 0,
  cost_this_month DECIMAL(10,2) DEFAULT 0.00,

  -- Limits
  max_calls_per_month INT DEFAULT 10000,
  max_characters_per_month INT DEFAULT 1000000,
  max_cost_per_month DECIMAL(10,2) DEFAULT 1000.00,

  -- Alert thresholds
  alert_at_usage_percent INT DEFAULT 80,  -- Alert when 80% used
  alert_email_sent BOOLEAN DEFAULT false,

  -- Timestamp
  month_start_at TIMESTAMP NOT NULL DEFAULT date_trunc('month', NOW()),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_api_usage_quota_unique
  ON api_usage_quotas(user_id, provider_name, month_start_at);

-- ============================================================================
-- Cleanup: Auto-delete expired cache entries
-- ============================================================================
-- Translation cache entries expire after 1 hour
-- Transcription logs expire after 90 days (GDPR compliance)

-- Note: In production, use pg_cron extension:
-- SELECT cron.schedule('cleanup-translation-cache', '*/30 * * * *',
--   'DELETE FROM translation_cache WHERE expires_at < NOW()');
-- SELECT cron.schedule('cleanup-transcription-logs', '0 2 * * *',
--   'DELETE FROM transcription_logs WHERE expires_at < NOW()');
