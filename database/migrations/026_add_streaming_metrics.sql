/**
 * Streaming Metrics Storage
 * Phase 13.7: Track streaming latency for each component
 */

-- Create streaming metrics table
CREATE TABLE IF NOT EXISTS streaming_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,

  -- Transcription metrics
  transcription_latency_ms INTEGER,
  transcription_hypothesis_count INTEGER,
  transcription_final_count INTEGER,
  transcription_avg_confidence DECIMAL(3,2),

  -- Translation metrics
  translation_latency_ms INTEGER,
  translation_batch_count INTEGER,
  translation_chunk_count INTEGER,
  translation_avg_processing_ms INTEGER,

  -- TTS metrics
  tts_latency_ms INTEGER,
  tts_synthesis_chunk_count INTEGER,
  tts_synthesized_count INTEGER,
  tts_avg_synthesis_ms INTEGER,
  tts_p95_synthesis_ms INTEGER,

  -- Network metrics
  network_latency_ms INTEGER,
  jitter_ms INTEGER,
  packet_loss_percent DECIMAL(5,2),

  -- Buffer metrics
  buffer_size_ms INTEGER,
  buffer_fill_percent DECIMAL(5,2),

  -- End-to-end
  e2e_latency_ms INTEGER,

  -- Session info
  duration_ms INTEGER,
  collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT streaming_metrics_call_id_fk FOREIGN KEY (call_id)
    REFERENCES call_recordings(call_id) ON DELETE CASCADE
);

CREATE INDEX idx_streaming_metrics_call_id ON streaming_metrics(call_id);
CREATE INDEX idx_streaming_metrics_collected_at ON streaming_metrics(collected_at);

-- Create transcription hypothesis tracking
CREATE TABLE IF NOT EXISTS transcription_hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id VARCHAR(255) NOT NULL,
  stream_id VARCHAR(255) NOT NULL,

  text TEXT NOT NULL,
  is_final BOOLEAN DEFAULT FALSE,
  language VARCHAR(10) NOT NULL,
  confidence DECIMAL(3,2),

  word_timings JSONB, -- Array of {word, startMs, endMs, confidence}

  sequence_number INTEGER,
  latency_ms INTEGER, -- Time from audio chunk to hypothesis

  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT transcription_hypotheses_call_id_fk FOREIGN KEY (call_id)
    REFERENCES call_recordings(call_id) ON DELETE CASCADE
);

CREATE INDEX idx_transcription_hypotheses_call_id ON transcription_hypotheses(call_id);
CREATE INDEX idx_transcription_hypotheses_is_final ON transcription_hypotheses(is_final);
CREATE INDEX idx_transcription_hypotheses_recorded_at ON transcription_hypotheses(recorded_at);

-- Create translation batch tracking
CREATE TABLE IF NOT EXISTS translation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id VARCHAR(255) NOT NULL,
  batch_id VARCHAR(255) NOT NULL,

  source_language VARCHAR(10) NOT NULL,
  target_language VARCHAR(10) NOT NULL,
  provider VARCHAR(50),

  chunk_count INTEGER,
  processing_time_ms INTEGER,

  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT translation_batches_call_id_fk FOREIGN KEY (call_id)
    REFERENCES call_recordings(call_id) ON DELETE CASCADE
);

CREATE INDEX idx_translation_batches_call_id ON translation_batches(call_id);
CREATE INDEX idx_translation_batches_recorded_at ON translation_batches(recorded_at);

-- Create translation chunks tracking
CREATE TABLE IF NOT EXISTS translation_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id VARCHAR(255) NOT NULL,
  call_id VARCHAR(255) NOT NULL,

  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  confidence DECIMAL(3,2),
  is_sentence_end BOOLEAN,

  source_language VARCHAR(10),
  target_language VARCHAR(10),

  chunk_index INTEGER,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT translation_chunks_call_id_fk FOREIGN KEY (call_id)
    REFERENCES call_recordings(call_id) ON DELETE CASCADE,
  CONSTRAINT translation_chunks_batch_id_fk FOREIGN KEY (batch_id)
    REFERENCES translation_batches(batch_id) ON DELETE CASCADE
);

CREATE INDEX idx_translation_chunks_batch_id ON translation_chunks(batch_id);
CREATE INDEX idx_translation_chunks_call_id ON translation_chunks(call_id);

-- Create TTS synthesis tracking
CREATE TABLE IF NOT EXISTS tts_synthesis_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,

  text TEXT NOT NULL,
  language VARCHAR(10) NOT NULL,
  voice_id VARCHAR(255),
  provider VARCHAR(50),

  is_synthesized BOOLEAN DEFAULT FALSE,
  duration_ms INTEGER,
  synthesis_time_ms INTEGER,

  sentence_number INTEGER,
  chunk_index INTEGER,

  synthesis_started_at TIMESTAMP WITH TIME ZONE,
  synthesis_completed_at TIMESTAMP WITH TIME ZONE,

  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT tts_synthesis_chunks_call_id_fk FOREIGN KEY (call_id)
    REFERENCES call_recordings(call_id) ON DELETE CASCADE
);

CREATE INDEX idx_tts_synthesis_chunks_call_id ON tts_synthesis_chunks(call_id);
CREATE INDEX idx_tts_synthesis_chunks_is_synthesized ON tts_synthesis_chunks(is_synthesized);
CREATE INDEX idx_tts_synthesis_chunks_recorded_at ON tts_synthesis_chunks(recorded_at);

-- Create buffer state tracking
CREATE TABLE IF NOT EXISTS buffer_state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id VARCHAR(255) NOT NULL,

  buffer_size_ms INTEGER,
  buffer_fill_percent DECIMAL(5,2),

  network_latency_ms INTEGER,
  jitter_ms INTEGER,
  packet_loss_percent DECIMAL(5,2),

  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT buffer_state_history_call_id_fk FOREIGN KEY (call_id)
    REFERENCES call_recordings(call_id) ON DELETE CASCADE
);

CREATE INDEX idx_buffer_state_history_call_id ON buffer_state_history(call_id);
CREATE INDEX idx_buffer_state_history_recorded_at ON buffer_state_history(recorded_at);

-- View for streaming performance summary
CREATE OR REPLACE VIEW streaming_performance_summary AS
SELECT
  call_id,
  AVG(COALESCE(e2e_latency_ms, 0)) as avg_e2e_latency_ms,
  MAX(COALESCE(e2e_latency_ms, 0)) as max_e2e_latency_ms,
  AVG(COALESCE(transcription_latency_ms, 0)) as avg_transcription_latency_ms,
  AVG(COALESCE(translation_latency_ms, 0)) as avg_translation_latency_ms,
  AVG(COALESCE(tts_latency_ms, 0)) as avg_tts_latency_ms,
  AVG(COALESCE(network_latency_ms, 0)) as avg_network_latency_ms,
  AVG(COALESCE(jitter_ms, 0)) as avg_jitter_ms,
  AVG(COALESCE(packet_loss_percent, 0)) as avg_packet_loss_percent,
  COUNT(*) as metric_samples
FROM streaming_metrics
GROUP BY call_id;
