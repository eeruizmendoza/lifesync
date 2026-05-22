/**
 * Phase 13.4: Call Recordings Schema
 * Stores encrypted recording metadata and S3 references
 */

CREATE TABLE IF NOT EXISTS call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Call reference
  call_id VARCHAR(255) NOT NULL,
  recording_id VARCHAR(255) NOT NULL UNIQUE,

  -- Participants
  caller_id UUID NOT NULL,
  receiver_id UUID NOT NULL,

  -- Recording metadata
  start_time BIGINT NOT NULL,
  end_time BIGINT,
  duration_ms INTEGER,

  -- Language pair
  source_language VARCHAR(10),
  target_language VARCHAR(10),

  -- File information
  codec VARCHAR(50),
  original_size BIGINT,
  encrypted_size BIGINT,

  -- S3 storage
  s3_path VARCHAR(512),
  is_encrypted BOOLEAN DEFAULT TRUE,
  encryption_algorithm VARCHAR(50) DEFAULT 'XChaCha20-Poly1305',

  -- Encryption metadata (for client-side decryption)
  encryption_iv VARCHAR(512),
  encryption_auth_tag VARCHAR(512),
  encryption_salt VARCHAR(512),

  -- Derived encryption key (per-call key from master key + call ID)
  encryption_key_derived BOOLEAN DEFAULT TRUE,

  -- Metrics snapshot
  metrics JSONB,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Soft delete for user privacy
  deleted_at TIMESTAMP,

  -- Indexes
  CONSTRAINT fk_caller FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_call_recordings_call_id ON call_recordings(call_id);
CREATE INDEX idx_call_recordings_recording_id ON call_recordings(recording_id);
CREATE INDEX idx_call_recordings_caller_id ON call_recordings(caller_id, created_at DESC);
CREATE INDEX idx_call_recordings_receiver_id ON call_recordings(receiver_id, created_at DESC);
CREATE INDEX idx_call_recordings_created_at ON call_recordings(created_at DESC);
CREATE INDEX idx_call_recordings_s3_path ON call_recordings(s3_path);
CREATE INDEX idx_call_recordings_encrypted ON call_recordings(is_encrypted);
CREATE INDEX idx_call_recordings_deleted_at ON call_recordings(deleted_at) WHERE deleted_at IS NULL;

-- Store encryption keys separately for extra security
CREATE TABLE IF NOT EXISTS call_recording_encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  recording_id VARCHAR(255) NOT NULL UNIQUE,
  call_id VARCHAR(255) NOT NULL,

  -- Encrypted per-call key (encrypted with user's master key)
  -- User stores master key in memory; we store derived per-call key encrypted
  encrypted_key_material VARCHAR(1024) NOT NULL,

  -- Key derivation parameters
  key_derivation_algorithm VARCHAR(50) DEFAULT 'scrypt',
  key_derivation_params JSONB, -- { salt, N, r, p }

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_recording FOREIGN KEY (recording_id) REFERENCES call_recordings(recording_id) ON DELETE CASCADE
);

CREATE INDEX idx_recording_encryption_keys_call_id ON call_recording_encryption_keys(call_id);
CREATE INDEX idx_recording_encryption_keys_recording_id ON call_recording_encryption_keys(recording_id);

-- Audit trail for recording access
CREATE TABLE IF NOT EXISTS call_recording_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  recording_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,

  -- Action type
  action VARCHAR(50) NOT NULL, -- 'view', 'download', 'delete', 'share'

  -- IP address (for security audit)
  ip_address VARCHAR(45),
  user_agent VARCHAR(512),

  -- Timestamp
  accessed_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_recording_log FOREIGN KEY (recording_id) REFERENCES call_recordings(recording_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_log FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_recording_access_logs_recording_id ON call_recording_access_logs(recording_id);
CREATE INDEX idx_recording_access_logs_user_id ON call_recording_access_logs(user_id);
CREATE INDEX idx_recording_access_logs_accessed_at ON call_recording_access_logs(accessed_at DESC);

-- Recording transcripts (original + translated)
CREATE TABLE IF NOT EXISTS call_recording_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  recording_id VARCHAR(255) NOT NULL,

  -- Speaker info
  speaker_role VARCHAR(50) NOT NULL, -- 'caller' or 'receiver'
  speaker_id UUID NOT NULL,

  -- Transcript content
  original_text TEXT,
  original_language VARCHAR(10),

  translated_text TEXT,
  translated_language VARCHAR(10),

  -- Timing
  start_ms INTEGER,
  end_ms INTEGER,
  duration_ms INTEGER,

  -- Confidence scores
  transcription_confidence DECIMAL(3, 2), -- 0.00 to 1.00
  translation_confidence DECIMAL(3, 2),

  -- Sequence in transcript
  sequence_number INTEGER,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_transcript_recording FOREIGN KEY (recording_id) REFERENCES call_recordings(recording_id) ON DELETE CASCADE,
  CONSTRAINT fk_transcript_speaker FOREIGN KEY (speaker_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_recording_transcripts_recording_id ON call_recording_transcripts(recording_id);
CREATE INDEX idx_recording_transcripts_sequence ON call_recording_transcripts(recording_id, sequence_number);
CREATE INDEX idx_recording_transcripts_speaker_id ON call_recording_transcripts(speaker_id);

-- Recording metrics snapshots
CREATE TABLE IF NOT EXISTS call_recording_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  recording_id VARCHAR(255) NOT NULL,
  call_id VARCHAR(255) NOT NULL,

  -- Metrics
  latency_ms INTEGER,
  jitter_ms INTEGER,
  packet_loss_percent DECIMAL(5, 2),
  audio_quality_score DECIMAL(3, 2), -- 0.0 to 5.0
  video_quality_score DECIMAL(3, 2),
  bandwidth_kbps INTEGER,

  -- Collection timestamp
  collected_at BIGINT,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_metrics_recording FOREIGN KEY (recording_id) REFERENCES call_recordings(recording_id) ON DELETE CASCADE
);

CREATE INDEX idx_recording_metrics_recording_id ON call_recording_metrics(recording_id);
CREATE INDEX idx_recording_metrics_call_id ON call_recording_metrics(call_id);
CREATE INDEX idx_recording_metrics_collected_at ON call_recording_metrics(collected_at DESC);
