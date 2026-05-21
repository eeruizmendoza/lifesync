-- Migration 003: Add AI Model Management Tables
-- Purpose: Track model versions, benchmarks, switches, and costs
-- Date: 2026-05-21

-- ============================================================================
-- MODEL CONFIGURATION TABLE
-- Current active models and fallbacks
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_type VARCHAR(50) NOT NULL UNIQUE, -- 'stt', 'translation', 'tts'
  active_model VARCHAR(100) NOT NULL, -- 'whisper-v3', 'deepl-v3', etc.
  previous_model VARCHAR(100), -- Last active model (for rollback)
  fallback_model VARCHAR(100) NOT NULL, -- Always-available fallback
  last_switched_at TIMESTAMP,
  improvement_percent DECIMAL(5,2), -- From benchmark comparison
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT check_model_type CHECK (model_type IN ('stt', 'translation', 'tts'))
);

CREATE INDEX IF NOT EXISTS idx_model_config_type ON model_config(model_type);

-- ============================================================================
-- MODEL BENCHMARKS TABLE
-- Historical benchmark results for each model
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_type VARCHAR(50) NOT NULL, -- 'stt', 'translation', 'tts'
  current_model VARCHAR(100) NOT NULL,
  current_score DECIMAL(5,4), -- WER, BLEU, MOS
  new_model VARCHAR(100) NOT NULL,
  new_score DECIMAL(5,4),
  improvement DECIMAL(5,4), -- 0-1 (0.02 = 2%)
  should_switch BOOLEAN,
  confidence DECIMAL(3,2), -- 0-1
  recommended_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_model_type ON model_benchmarks(model_type);
CREATE INDEX IF NOT EXISTS idx_benchmarks_recommended_at ON model_benchmarks(recommended_at DESC);
CREATE INDEX IF NOT EXISTS idx_benchmarks_new_model ON model_benchmarks(new_model);

-- ============================================================================
-- MODEL SWITCH LOG TABLE
-- Audit trail of all model changes
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_switch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_type VARCHAR(50) NOT NULL,
  from_model VARCHAR(100) NOT NULL,
  to_model VARCHAR(100) NOT NULL,
  reason VARCHAR(255), -- 'Auto-switch: 5% improvement', 'Manual override', 'Emergency rollback'
  improvement_percent DECIMAL(5,2),
  switched_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100) -- User or 'system'
);

CREATE INDEX IF NOT EXISTS idx_switch_log_model_type ON model_switch_log(model_type);
CREATE INDEX IF NOT EXISTS idx_switch_log_switched_at ON model_switch_log(switched_at DESC);
CREATE INDEX IF NOT EXISTS idx_switch_log_from_to ON model_switch_log(from_model, to_model);

-- ============================================================================
-- MODEL FALLBACK LOG TABLE
-- Track when system falls back to secondary models
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_fallback_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_model VARCHAR(100) NOT NULL,
  fallback_model VARCHAR(100) NOT NULL,
  reason VARCHAR(255), -- 'Health check failed', 'Timeout', 'Rate limit'
  fallback_time TIMESTAMP DEFAULT NOW(),
  restored_at TIMESTAMP -- When primary came back online
);

CREATE INDEX IF NOT EXISTS idx_fallback_log_primary_model ON model_fallback_log(primary_model);
CREATE INDEX IF NOT EXISTS idx_fallback_log_fallback_time ON model_fallback_log(fallback_time DESC);

-- ============================================================================
-- MODEL METRICS TABLE
-- Real-time metrics for deployed models
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_type VARCHAR(50) NOT NULL,
  model_name VARCHAR(100) NOT NULL,

  -- Performance metrics
  latency_ms INT, -- Average latency
  latency_p95 INT, -- 95th percentile
  latency_p99 INT, -- 99th percentile

  -- Quality metrics
  error_rate DECIMAL(5,4), -- 0-1
  success_rate DECIMAL(5,4), -- 0-1
  quality_score DECIMAL(3,2), -- 0-5 (MOS) or 0-1 (WER/BLEU)

  -- Cost metrics
  cost_per_unit DECIMAL(10,6), -- Per minute, char, etc.
  total_cost_today DECIMAL(12,2),

  -- Volume
  requests_total BIGINT,
  requests_last_hour INT,
  requests_last_minute INT,

  -- Measured at
  measured_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_model_type ON model_metrics(model_type);
CREATE INDEX IF NOT EXISTS idx_metrics_model_name ON model_metrics(model_name);
CREATE INDEX IF NOT EXISTS idx_metrics_measured_at ON model_metrics(measured_at DESC);

-- ============================================================================
-- RESEARCH PIPELINE RUNS TABLE
-- Historical log of research pipeline executions
-- ============================================================================
CREATE TABLE IF NOT EXISTS research_pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP NOT NULL,
  new_versions_found INT,
  benchmarks_run INT,
  switches_made INT,
  improvements_json JSONB, -- Array of improvements
  errors_json JSONB, -- Array of errors
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_timestamp ON research_pipeline_runs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_switches_made ON research_pipeline_runs(switches_made);

-- ============================================================================
-- MODEL COSTS TABLE
-- Pricing for each model from each provider
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name VARCHAR(100) NOT NULL,
  provider VARCHAR(100) NOT NULL, -- 'openai', 'deepl', 'elevenlabs'
  model_type VARCHAR(50) NOT NULL, -- 'stt', 'translation', 'tts'

  -- Pricing
  cost_per_minute DECIMAL(10,6), -- For STT/TTS
  cost_per_million_chars DECIMAL(12,2), -- For translation

  -- Pricing date
  effective_date DATE,

  -- Usage limits
  rate_limit_requests_per_minute INT,
  rate_limit_tokens_per_minute INT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_model_cost UNIQUE (model_name, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_costs_model_name ON model_costs(model_name);
CREATE INDEX IF NOT EXISTS idx_costs_provider ON model_costs(provider);
CREATE INDEX IF NOT EXISTS idx_costs_effective_date ON model_costs(effective_date DESC);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- Commented out - using application-level updates for now
-- ============================================================================
-- CREATE TRIGGER update_model_config_updated_at
-- BEFORE UPDATE ON model_config
-- FOR EACH ROW
-- EXECUTE FUNCTION update_updated_at_column();
--
-- CREATE TRIGGER update_model_metrics_updated_at
-- BEFORE UPDATE ON model_metrics
-- FOR EACH ROW
-- EXECUTE FUNCTION update_updated_at_column();
--
-- CREATE TRIGGER update_model_costs_updated_at
-- BEFORE UPDATE ON model_costs
-- FOR EACH ROW
-- EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIALIZATION
-- ============================================================================

-- Insert default configurations
INSERT INTO model_config (model_type, active_model, previous_model, fallback_model)
VALUES
  ('stt', 'whisper-v3', NULL, 'deepgram-nova-2'),
  ('translation', 'deepl-v3', NULL, 'seamless-m4t'),
  ('tts', 'elevenlabs-v3', NULL, 'kokoro')
ON CONFLICT (model_type) DO NOTHING;

-- Insert current costs (will be updated by research pipeline)
INSERT INTO model_costs (model_name, provider, model_type, cost_per_minute, cost_per_million_chars, effective_date)
VALUES
  ('whisper-v3', 'openai', 'stt', 0.003, NULL, NOW()::DATE),
  ('deepl-v3', 'deepl', 'translation', NULL, 25.00, NOW()::DATE),
  ('elevenlabs-v3', 'elevenlabs', 'tts', 0.30, NULL, NOW()::DATE)
ON CONFLICT DO NOTHING;
