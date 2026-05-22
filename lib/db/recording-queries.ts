/**
 * Call Recording Database Queries
 * Phase 13.4: Recording metadata and encryption key management
 */

import { query } from '@/lib/db';

export interface CallRecordingRow {
  id: string;
  call_id: string;
  recording_id: string;
  caller_id: string;
  receiver_id: string;
  start_time: number;
  end_time: number | null;
  duration_ms: number | null;
  source_language: string | null;
  target_language: string | null;
  codec: string | null;
  original_size: number | null;
  encrypted_size: number | null;
  s3_path: string | null;
  is_encrypted: boolean;
  encryption_algorithm: string;
  encryption_iv: string | null;
  encryption_auth_tag: string | null;
  encryption_salt: string | null;
  encryption_key_derived: boolean;
  metrics: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Store recording metadata after finalization
 */
export async function createCallRecording(
  callId: string,
  recordingId: string,
  callerId: string,
  receiverId: string,
  startTime: number,
  codec: string,
  sourceLanguage: string,
  targetLanguage: string,
  s3Path: string,
  originalSize: number,
  encryptedSize: number,
  encryptionIv: string,
  encryptionAuthTag: string,
  encryptionSalt: string,
  metrics?: Record<string, any>
): Promise<CallRecordingRow> {
  const sql = `
    INSERT INTO call_recordings (
      call_id,
      recording_id,
      caller_id,
      receiver_id,
      start_time,
      codec,
      source_language,
      target_language,
      s3_path,
      original_size,
      encrypted_size,
      encryption_iv,
      encryption_auth_tag,
      encryption_salt,
      is_encrypted,
      encryption_algorithm,
      encryption_key_derived,
      metrics
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING *
  `;

  const result = await query(sql, [
    callId,
    recordingId,
    callerId,
    receiverId,
    startTime,
    codec,
    sourceLanguage,
    targetLanguage,
    s3Path,
    originalSize,
    encryptedSize,
    encryptionIv,
    encryptionAuthTag,
    encryptionSalt,
    true, // is_encrypted
    'XChaCha20-Poly1305',
    true, // encryption_key_derived
    JSON.stringify(metrics || {}),
  ]);

  return result.rows[0] as CallRecordingRow;
}

/**
 * Store per-call encryption key (encrypted with user master key)
 */
export async function storeRecordingEncryptionKey(
  recordingId: string,
  callId: string,
  encryptedKeyMaterial: string,
  keyDerivationAlgorithm: string = 'scrypt',
  keyDerivationParams?: Record<string, any>
): Promise<void> {
  const sql = `
    INSERT INTO call_recording_encryption_keys (
      recording_id,
      call_id,
      encrypted_key_material,
      key_derivation_algorithm,
      key_derivation_params
    ) VALUES ($1, $2, $3, $4, $5)
  `;

  await query(sql, [
    recordingId,
    callId,
    encryptedKeyMaterial,
    keyDerivationAlgorithm,
    JSON.stringify(keyDerivationParams || {}),
  ]);
}

/**
 * Get recording by ID
 */
export async function getRecordingById(recordingId: string): Promise<CallRecordingRow | null> {
  const sql = `
    SELECT * FROM call_recordings
    WHERE recording_id = $1 AND deleted_at IS NULL
    LIMIT 1
  `;

  const result = await query(sql, [recordingId]);
  return result.rows[0] as CallRecordingRow | undefined || null;
}

/**
 * Get recording by call ID
 */
export async function getRecordingByCallId(callId: string): Promise<CallRecordingRow | null> {
  const sql = `
    SELECT * FROM call_recordings
    WHERE call_id = $1 AND deleted_at IS NULL
    LIMIT 1
  `;

  const result = await query(sql, [callId]);
  return result.rows[0] as CallRecordingRow | undefined || null;
}

/**
 * Get all recordings for a user (caller or receiver)
 */
export async function getUserRecordings(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<CallRecordingRow[]> {
  const sql = `
    SELECT * FROM call_recordings
    WHERE (caller_id = $1 OR receiver_id = $1) AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await query(sql, [userId, limit, offset]);
  return result.rows as CallRecordingRow[];
}

/**
 * Get recordings count for a user
 */
export async function getUserRecordingsCount(userId: string): Promise<number> {
  const sql = `
    SELECT COUNT(*) as count FROM call_recordings
    WHERE (caller_id = $1 OR receiver_id = $1) AND deleted_at IS NULL
  `;

  const result = await query(sql, [userId]);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Update recording end time and duration
 */
export async function updateRecordingCompletion(
  recordingId: string,
  endTime: number,
  duration: number,
  metrics?: Record<string, any>
): Promise<CallRecordingRow> {
  const sql = `
    UPDATE call_recordings
    SET
      end_time = $2,
      duration_ms = $3,
      metrics = $4,
      updated_at = NOW()
    WHERE recording_id = $1
    RETURNING *
  `;

  const result = await query(sql, [
    recordingId,
    endTime,
    duration,
    JSON.stringify(metrics || {}),
  ]);

  return result.rows[0] as CallRecordingRow;
}

/**
 * Get recording encryption key
 */
export async function getRecordingEncryptionKey(
  recordingId: string
): Promise<{ encryptedKeyMaterial: string; keyDerivationParams: Record<string, any> } | null> {
  const sql = `
    SELECT encrypted_key_material, key_derivation_params
    FROM call_recording_encryption_keys
    WHERE recording_id = $1
    LIMIT 1
  `;

  const result = await query(sql, [recordingId]);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    encryptedKeyMaterial: row.encrypted_key_material,
    keyDerivationParams: row.key_derivation_params || {},
  };
}

/**
 * Log recording access for audit trail
 */
export async function logRecordingAccess(
  recordingId: string,
  userId: string,
  action: 'view' | 'download' | 'delete' | 'share',
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const sql = `
    INSERT INTO call_recording_access_logs (
      recording_id,
      user_id,
      action,
      ip_address,
      user_agent
    ) VALUES ($1, $2, $3, $4, $5)
  `;

  await query(sql, [recordingId, userId, action, ipAddress || null, userAgent || null]);
}

/**
 * Store transcript segments
 */
export async function addTranscriptSegment(
  recordingId: string,
  speakerId: string,
  speakerRole: 'caller' | 'receiver',
  originalText: string,
  originalLanguage: string,
  translatedText: string,
  translatedLanguage: string,
  startMs: number,
  endMs: number,
  durationMs: number,
  transcriptionConfidence: number,
  translationConfidence: number,
  sequenceNumber: number
): Promise<void> {
  const sql = `
    INSERT INTO call_recording_transcripts (
      recording_id,
      speaker_id,
      speaker_role,
      original_text,
      original_language,
      translated_text,
      translated_language,
      start_ms,
      end_ms,
      duration_ms,
      transcription_confidence,
      translation_confidence,
      sequence_number
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  `;

  await query(sql, [
    recordingId,
    speakerId,
    speakerRole,
    originalText,
    originalLanguage,
    translatedText,
    translatedLanguage,
    startMs,
    endMs,
    durationMs,
    transcriptionConfidence,
    translationConfidence,
    sequenceNumber,
  ]);
}

/**
 * Get full transcript for a recording
 */
export async function getRecordingTranscript(recordingId: string): Promise<any[]> {
  const sql = `
    SELECT * FROM call_recording_transcripts
    WHERE recording_id = $1
    ORDER BY sequence_number ASC
  `;

  const result = await query(sql, [recordingId]);
  return result.rows;
}

/**
 * Store recording metrics
 */
export async function addRecordingMetrics(
  recordingId: string,
  callId: string,
  latencyMs: number,
  jitterMs: number,
  packetLossPercent: number,
  audioQualityScore: number,
  videoQualityScore: number | null,
  bandwidthKbps: number,
  collectedAt: number
): Promise<void> {
  const sql = `
    INSERT INTO call_recording_metrics (
      recording_id,
      call_id,
      latency_ms,
      jitter_ms,
      packet_loss_percent,
      audio_quality_score,
      video_quality_score,
      bandwidth_kbps,
      collected_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `;

  await query(sql, [
    recordingId,
    callId,
    latencyMs,
    jitterMs,
    packetLossPercent,
    audioQualityScore,
    videoQualityScore || null,
    bandwidthKbps,
    collectedAt,
  ]);
}

/**
 * Soft delete a recording (privacy)
 */
export async function deleteRecording(recordingId: string): Promise<void> {
  const sql = `
    UPDATE call_recordings
    SET deleted_at = NOW()
    WHERE recording_id = $1
  `;

  await query(sql, [recordingId]);
}

/**
 * Calculate total storage used by a user
 */
export async function getUserStorageUsage(userId: string): Promise<{ totalBytes: number; recordingCount: number }> {
  const sql = `
    SELECT
      COALESCE(SUM(encrypted_size), 0) as total_bytes,
      COUNT(*) as recording_count
    FROM call_recordings
    WHERE (caller_id = $1 OR receiver_id = $1) AND deleted_at IS NULL
  `;

  const result = await query(sql, [userId]);
  const row = result.rows[0];

  return {
    totalBytes: parseInt(row.total_bytes, 10),
    recordingCount: parseInt(row.recording_count, 10),
  };
}

/**
 * Get access logs for a recording
 */
export async function getRecordingAccessLogs(recordingId: string, limit: number = 100): Promise<any[]> {
  const sql = `
    SELECT * FROM call_recording_access_logs
    WHERE recording_id = $1
    ORDER BY accessed_at DESC
    LIMIT $2
  `;

  const result = await query(sql, [recordingId, limit]);
  return result.rows;
}

/**
 * Check if user has access to recording
 */
export async function userHasRecordingAccess(recordingId: string, userId: string): Promise<boolean> {
  const sql = `
    SELECT 1 FROM call_recordings
    WHERE recording_id = $1
      AND (caller_id = $2 OR receiver_id = $2)
      AND deleted_at IS NULL
    LIMIT 1
  `;

  const result = await query(sql, [recordingId, userId]);
  return result.rows.length > 0;
}

/**
 * Get recent recordings (for dashboard)
 */
export async function getRecentRecordings(userId: string, limit: number = 10): Promise<CallRecordingRow[]> {
  const sql = `
    SELECT * FROM call_recordings
    WHERE (caller_id = $1 OR receiver_id = $1) AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT $2
  `;

  const result = await query(sql, [userId, limit]);
  return result.rows as CallRecordingRow[];
}

/**
 * Search recordings by language pair
 */
export async function searchRecordingsByLanguagePair(
  userId: string,
  sourceLanguage: string,
  targetLanguage: string,
  limit: number = 50
): Promise<CallRecordingRow[]> {
  const sql = `
    SELECT * FROM call_recordings
    WHERE (caller_id = $1 OR receiver_id = $1)
      AND source_language = $2
      AND target_language = $3
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT $4
  `;

  const result = await query(sql, [userId, sourceLanguage, targetLanguage, limit]);
  return result.rows as CallRecordingRow[];
}
