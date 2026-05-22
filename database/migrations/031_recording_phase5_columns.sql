/**
 * Migration 031: Phase 5 Recording Columns
 * Adds missing columns to call_recordings and related tables
 * to support the Phase 5 upload/download/transcription pipeline
 */

-- ============================================================================
-- call_recordings: Add Phase 5 columns
-- ============================================================================

-- Storage key (encrypted S3 filename — replaces s3_path)
ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS s3_key VARCHAR(512);

-- Sync existing s3_path → s3_key (rename semantics)
UPDATE call_recordings SET s3_key = s3_path WHERE s3_key IS NULL AND s3_path IS NOT NULL;

-- Conversation reference for multi-participant queries
ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS conversation_id UUID;

-- MIME type for response Content-Type header
ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100) DEFAULT 'audio/webm';

-- File sizes in bytes (separate from duration-based metrics)
ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;

-- Sync from original_size where available
UPDATE call_recordings SET file_size_bytes = original_size WHERE file_size_bytes IS NULL;

-- Duration in seconds (float, replaces duration_ms ÷ 1000 gymnastics)
ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS duration_seconds DECIMAL(10, 3);

UPDATE call_recordings
  SET duration_seconds = duration_ms / 1000.0
  WHERE duration_seconds IS NULL AND duration_ms IS NOT NULL;

-- Recording type: audio, video, screen_share
ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS recording_type VARCHAR(20) DEFAULT 'audio';

-- Processing pipeline status
ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) DEFAULT 'pending';

ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS transcription_status VARCHAR(20) DEFAULT 'pending';

-- Convenience: which user initiated the upload (usually caller_id)
ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Sync from caller_id where user_id not yet set
UPDATE call_recordings SET user_id = caller_id WHERE user_id IS NULL;

-- Permanent deletion flag (set by cleanup job after 30-day retention)
ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS is_deleted_permanently BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- Indexes for new columns
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_call_recordings_s3_key
  ON call_recordings(s3_key);

CREATE INDEX IF NOT EXISTS idx_call_recordings_conversation_id
  ON call_recordings(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_recordings_processing_status
  ON call_recordings(processing_status)
  WHERE processing_status != 'complete';

CREATE INDEX IF NOT EXISTS idx_call_recordings_transcription_status
  ON call_recordings(transcription_status)
  WHERE transcription_status != 'complete';

CREATE INDEX IF NOT EXISTS idx_call_recordings_user_id
  ON call_recordings(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_recordings_permanent_purge
  ON call_recordings(deleted_at)
  WHERE deleted_at IS NOT NULL AND (is_deleted_permanently IS NULL OR is_deleted_permanently = false);

-- ============================================================================
-- call_recording_metrics: align column names
-- ============================================================================

ALTER TABLE call_recording_metrics
  ADD COLUMN IF NOT EXISTS jitter_ms INTEGER;

ALTER TABLE call_recording_metrics
  ADD COLUMN IF NOT EXISTS packet_loss_percent DECIMAL(5, 2);

-- ============================================================================
-- call_recording_transcripts: allow UUID speaker reference
-- ============================================================================

-- The existing speaker_role column ('caller'|'receiver') stays.
-- Add speaker_id UUID if not present (for direct user reference).
ALTER TABLE call_recording_transcripts
  ADD COLUMN IF NOT EXISTS speaker_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- call_recording_access_logs: ensure recording_id can reference UUID ids
-- ============================================================================
-- No changes needed — recording_id is VARCHAR(255) which covers both old
-- VARCHAR recording_id values and UUID id values.

-- ============================================================================
-- Verification queries (informational only — not executed)
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'call_recordings' ORDER BY ordinal_position;
