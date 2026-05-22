-- Migration 034: Pending calls table for incoming call notifications
-- Enables polling-based call notification on serverless infrastructure

CREATE TABLE IF NOT EXISTS pending_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id VARCHAR(100) NOT NULL UNIQUE,
  caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_language VARCHAR(10) NOT NULL DEFAULT 'en',
  target_language VARCHAR(10) NOT NULL DEFAULT 'en',
  call_type VARCHAR(20) NOT NULL DEFAULT 'audio',
  status VARCHAR(20) NOT NULL DEFAULT 'ringing', -- ringing | answered | rejected | missed | expired
  caller_name VARCHAR(255),
  caller_phone VARCHAR(50),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 seconds'),
  answered_at TIMESTAMP,
  rejected_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_calls_receiver ON pending_calls(receiver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_calls_caller ON pending_calls(caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_calls_call_id ON pending_calls(call_id);
CREATE INDEX IF NOT EXISTS idx_pending_calls_expires ON pending_calls(expires_at) WHERE status = 'ringing';
