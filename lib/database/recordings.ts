/**
 * Database Queries for Recordings
 * Phase 5: Recording, Encryption & Storage
 */

import { db } from '@/lib/db';

export interface ConversationRecordingMetadata {
  id: string;
  conversationId: string;
  userId: string;
  recordingType: 'audio' | 'video' | 'screen_share';
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
  isEncrypted: boolean;
  encryptionAlgorithm: string;
  processingStatus: 'pending' | 'processing' | 'complete' | 'failed';
  transcriptionStatus: 'pending' | 'processing' | 'complete' | 'failed';
  s3Key: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TranscriptLine {
  id: string;
  recordingId: string;
  speakerId: string;
  originalText: string;
  translatedText?: string;
  startMs: number;
  endMs: number;
  transcriptionConfidence?: number;
  translationConfidence?: number;
}

export interface RecordingMetrics {
  recordingId: string;
  latencyMs: number;
  jitterMs: number;
  packetLossPct: number;
  audioQualityScore: number;
  videoQualityScore?: number;
  timestamp: Date;
}

/**
 * Get recording by ID with access control.
 * Supports lookup by either UUID id or VARCHAR recording_id.
 */
export async function getRecordingById(
  recordingId: string,
  userId: string
): Promise<ConversationRecordingMetadata | null> {
  try {
    const result = await db.query(
      `
      SELECT
        id,
        COALESCE(conversation_id::text, '')      AS conversation_id,
        COALESCE(user_id::text, caller_id::text) AS user_id,
        COALESCE(recording_type, 'audio')        AS recording_type,
        COALESCE(mime_type, 'audio/webm')        AS mime_type,
        COALESCE(file_size_bytes, original_size, 0)   AS file_size_bytes,
        COALESCE(duration_seconds, duration_ms::decimal / 1000, 0) AS duration_seconds,
        COALESCE(is_encrypted, true)             AS is_encrypted,
        COALESCE(encryption_algorithm, 'XChaCha20-Poly1305') AS encryption_algorithm,
        COALESCE(processing_status, 'pending')   AS processing_status,
        COALESCE(transcription_status, 'pending') AS transcription_status,
        COALESCE(s3_key, s3_path, '')            AS s3_key,
        created_at,
        updated_at
      FROM call_recordings
      WHERE (id::text = $1 OR recording_id = $1)
        AND (caller_id::text = $2 OR receiver_id::text = $2 OR user_id::text = $2)
        AND deleted_at IS NULL
      `,
      [recordingId, userId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      recordingType: row.recording_type,
      mimeType: row.mime_type,
      fileSizeBytes: parseInt(row.file_size_bytes, 10),
      durationSeconds: parseFloat(row.duration_seconds),
      isEncrypted: row.is_encrypted,
      encryptionAlgorithm: row.encryption_algorithm,
      processingStatus: row.processing_status,
      transcriptionStatus: row.transcription_status,
      s3Key: row.s3_key,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  } catch (error) {
    console.error('Failed to get recording:', error);
    throw error;
  }
}

/**
 * List user's recordings with pagination
 */
export async function listUserRecordings(
  userId: string,
  conversationId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ recordings: ConversationRecordingMetadata[]; total: number }> {
  try {
    // Get total count
    const countResult = await db.query(
      `
      SELECT COUNT(*) as total
      FROM call_recordings
      WHERE (conversation_id::text = $1 OR call_id = $1)
        AND (caller_id::text = $2 OR receiver_id::text = $2 OR user_id::text = $2)
        AND deleted_at IS NULL
      `,
      [conversationId, userId]
    );

    const total = parseInt(countResult.rows[0].total, 10);

    // Get paginated results
    const result = await db.query(
      `
      SELECT
        id,
        COALESCE(conversation_id::text, call_id) AS conversation_id,
        COALESCE(user_id::text, caller_id::text) AS user_id,
        COALESCE(recording_type, 'audio')        AS recording_type,
        COALESCE(mime_type, 'audio/webm')        AS mime_type,
        COALESCE(file_size_bytes, original_size, 0)   AS file_size_bytes,
        COALESCE(duration_seconds, duration_ms::decimal / 1000, 0) AS duration_seconds,
        COALESCE(is_encrypted, true)             AS is_encrypted,
        COALESCE(encryption_algorithm, 'XChaCha20-Poly1305') AS encryption_algorithm,
        COALESCE(processing_status, 'pending')   AS processing_status,
        COALESCE(transcription_status, 'pending') AS transcription_status,
        COALESCE(s3_key, s3_path, '')            AS s3_key,
        created_at,
        updated_at
      FROM call_recordings
      WHERE (conversation_id::text = $1 OR call_id = $1)
        AND (caller_id::text = $2 OR receiver_id::text = $2 OR user_id::text = $2)
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [conversationId, userId, limit, offset]
    );

    const recordings: ConversationRecordingMetadata[] = result.rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      recordingType: row.recording_type,
      mimeType: row.mime_type,
      fileSizeBytes: parseInt(row.file_size_bytes, 10),
      durationSeconds: parseFloat(row.duration_seconds),
      isEncrypted: row.is_encrypted,
      encryptionAlgorithm: row.encryption_algorithm,
      processingStatus: row.processing_status,
      transcriptionStatus: row.transcription_status,
      s3Key: row.s3_key,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));

    return { recordings, total };
  } catch (error) {
    console.error('Failed to list recordings:', error);
    throw error;
  }
}

/**
 * List ALL recordings for a user across all conversations (global view)
 */
export async function getAllUserRecordings(
  userId: string,
  orgId: string | null | undefined,
  limit: number = 20,
  offset: number = 0
): Promise<{ recordings: ConversationRecordingMetadata[]; total: number }> {
  try {
    const orgFilter = orgId ? 'AND org_id = $3' : '';
    const params: (string | number)[] = orgId
      ? [userId, limit, orgId, offset]
      : [userId, limit, offset];

    // Shift offset param index based on whether orgId is present
    const offsetIndex = orgId ? '$4' : '$3';

    const countResult = await db.query(
      `SELECT COUNT(*) as total
       FROM call_recordings
       WHERE (caller_id::text = $1 OR receiver_id::text = $1 OR user_id::text = $1)
         ${orgFilter}
         AND deleted_at IS NULL`,
      orgId ? [userId, orgId] : [userId]
    );

    const total = parseInt(countResult.rows[0].total, 10);

    const result = await db.query(
      `SELECT
        id,
        COALESCE(conversation_id::text, call_id) AS conversation_id,
        COALESCE(user_id::text, caller_id::text) AS user_id,
        COALESCE(recording_type, 'audio')        AS recording_type,
        COALESCE(mime_type, 'audio/webm')        AS mime_type,
        COALESCE(file_size_bytes, original_size, 0)   AS file_size_bytes,
        COALESCE(duration_seconds, duration_ms::decimal / 1000, 0) AS duration_seconds,
        COALESCE(is_encrypted, true)             AS is_encrypted,
        COALESCE(encryption_algorithm, 'XChaCha20-Poly1305') AS encryption_algorithm,
        COALESCE(processing_status, 'pending')   AS processing_status,
        COALESCE(transcription_status, 'pending') AS transcription_status,
        COALESCE(s3_key, s3_path, '')            AS s3_key,
        created_at,
        updated_at
       FROM call_recordings
       WHERE (caller_id::text = $1 OR receiver_id::text = $1 OR user_id::text = $1)
         ${orgFilter}
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET ${offsetIndex}`,
      params
    );

    const recordings: ConversationRecordingMetadata[] = result.rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      recordingType: row.recording_type,
      mimeType: row.mime_type,
      fileSizeBytes: parseInt(row.file_size_bytes, 10),
      durationSeconds: parseFloat(row.duration_seconds),
      isEncrypted: row.is_encrypted,
      encryptionAlgorithm: row.encryption_algorithm,
      processingStatus: row.processing_status,
      transcriptionStatus: row.transcription_status,
      s3Key: row.s3_key,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));

    return { recordings, total };
  } catch (error) {
    console.error('Failed to list all recordings:', error);
    throw error;
  }
}

/**
 * Create recording metadata.
 * Uses the Phase 5 columns (added in migration 031) plus the original
 * schema columns (caller_id, receiver_id, recording_id, start_time).
 */
export async function createRecordingMetadata(
  callId: string,
  userId: string,
  conversationId: string,
  s3Key: string,
  mimeType: string,
  fileSizeBytes: number,
  durationSeconds: number,
  recordingType: 'audio' | 'video' | 'screen_share' = 'audio',
  isEncrypted: boolean = true,
  encryptionAlgorithm: string = 'XChaCha20-Poly1305'
): Promise<string> {
  try {
    // Generate a short recording_id for the VARCHAR unique column
    const shortRecordingId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await db.query(
      `
      INSERT INTO call_recordings (
        recording_id,
        call_id,
        caller_id,
        receiver_id,
        user_id,
        conversation_id,
        recording_type,
        mime_type,
        file_size_bytes,
        original_size,
        duration_seconds,
        duration_ms,
        is_encrypted,
        encryption_algorithm,
        s3_key,
        s3_path,
        processing_status,
        transcription_status,
        start_time,
        created_at,
        updated_at
      ) VALUES (
        $1, $2,
        $3::uuid, $3::uuid,
        $3::uuid, $4::uuid,
        $5, $6, $7, $7,
        $8, ($8 * 1000)::integer,
        $9, $10, $11, $11,
        'pending', 'pending',
        EXTRACT(EPOCH FROM NOW())::bigint,
        NOW(), NOW()
      )
      RETURNING recording_id
      `,
      [
        shortRecordingId,
        callId,
        userId,
        conversationId,
        recordingType,
        mimeType,
        fileSizeBytes,
        durationSeconds,
        isEncrypted,
        encryptionAlgorithm,
        s3Key,
      ]
    );

    return shortRecordingId;
  } catch (error) {
    console.error('Failed to create recording metadata:', error);
    throw error;
  }
}

/**
 * Update recording processing/transcription status.
 * Supports both UUID id and VARCHAR recording_id lookups.
 */
export async function updateRecordingStatus(
  recordingId: string,
  processingStatus?: 'pending' | 'processing' | 'complete' | 'failed',
  transcriptionStatus?: 'pending' | 'processing' | 'complete' | 'failed'
): Promise<void> {
  try {
    const updates: string[] = [];
    const values: (string | null)[] = [];
    let paramCount = 1;

    if (processingStatus) {
      updates.push(`processing_status = $${paramCount++}`);
      values.push(processingStatus);
    }

    if (transcriptionStatus) {
      updates.push(`transcription_status = $${paramCount++}`);
      values.push(transcriptionStatus);
    }

    if (updates.length === 0) return;

    updates.push(`updated_at = NOW()`);
    values.push(recordingId);

    await db.query(
      `UPDATE call_recordings
       SET ${updates.join(', ')}
       WHERE (id::text = $${paramCount} OR recording_id = $${paramCount})`,
      values
    );
  } catch (error) {
    console.error('Failed to update recording status:', error);
    throw error;
  }
}

/**
 * Soft-delete recording (mark deleted_at timestamp)
 */
export async function deleteRecordingLogical(recordingId: string, userId: string): Promise<boolean> {
  try {
    const result = await db.query(
      `
      UPDATE call_recordings
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE (id::text = $1 OR recording_id = $1)
        AND (user_id::text = $2 OR caller_id::text = $2)
      RETURNING recording_id
      `,
      [recordingId, userId]
    );

    return result.rows.length > 0;
  } catch (error) {
    console.error('Failed to delete recording:', error);
    throw error;
  }
}

/**
 * Add transcript line for a recording.
 * Uses the existing call_recording_transcripts schema columns.
 */
export async function addTranscriptLine(
  recordingId: string,
  speakerId: string,
  originalText: string,
  translatedText: string | undefined,
  startMs: number,
  endMs: number,
  transcriptionConfidence?: number,
  translationConfidence?: number
): Promise<string> {
  try {
    const result = await db.query(
      `
      INSERT INTO call_recording_transcripts (
        recording_id, speaker_id, speaker_role,
        original_text, translated_text,
        start_ms, end_ms, duration_ms,
        transcription_confidence, translation_confidence,
        created_at
      ) VALUES ($1, $2::uuid, 'caller', $3, $4, $5, $6, ($6 - $5), $7, $8, NOW())
      RETURNING id
      `,
      [
        recordingId,
        speakerId,
        originalText,
        translatedText || null,
        startMs,
        endMs,
        transcriptionConfidence ?? 0,
        translationConfidence ?? 0,
      ]
    );

    return result.rows[0]?.id ?? 'unknown';
  } catch (error) {
    console.error('Failed to add transcript line:', error);
    throw error;
  }
}

/**
 * Log recording access for audit trail
 */
export async function logRecordingAccess(
  recordingId: string,
  userId: string,
  action: 'view' | 'download' | 'delete' | 'share',
  ipAddress: string,
  userAgent: string
): Promise<void> {
  try {
    await db.query(
      `
      INSERT INTO call_recording_access_logs (
        recording_id, user_id, action, ip_address, user_agent, accessed_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      `,
      [recordingId, userId, action, ipAddress, userAgent]
    );
  } catch (error) {
    console.error('Failed to log recording access:', error);
    throw error;
  }
}

/**
 * Add recording metrics
 */
export async function addRecordingMetrics(
  recordingId: string,
  latencyMs: number,
  jitterMs: number,
  packetLossPct: number,
  audioQualityScore: number,
  videoQualityScore?: number
): Promise<void> {
  try {
    await db.query(
      `
      INSERT INTO call_recording_metrics (
        recording_id, call_id, latency_ms, jitter_ms, packet_loss_percent,
        audio_quality_score, video_quality_score, collected_at, created_at
      ) VALUES ($1, $1, $2, $3, $4, $5, $6, EXTRACT(EPOCH FROM NOW())::bigint, NOW())
      `,
      [recordingId, latencyMs, jitterMs, packetLossPct, audioQualityScore, videoQualityScore || null]
    );
  } catch (error) {
    console.error('Failed to add recording metrics:', error);
    throw error;
  }
}

/**
 * Get user's total storage usage in bytes
 */
export async function getUserStorageUsage(userId: string): Promise<number> {
  try {
    const result = await db.query(
      `
      SELECT COALESCE(SUM(COALESCE(file_size_bytes, original_size, 0)), 0) AS total_bytes
      FROM call_recordings
      WHERE (user_id::text = $1 OR caller_id::text = $1) AND deleted_at IS NULL
      `,
      [userId]
    );

    return parseInt(result.rows[0].total_bytes, 10);
  } catch (error) {
    console.error('Failed to get user storage usage:', error);
    throw error;
  }
}

/**
 * Get transcript lines for a recording
 */
export async function getTranscriptForRecording(recordingId: string): Promise<TranscriptLine[]> {
  try {
    const result = await db.query(
      `
      SELECT
        id, recording_id, speaker_id, original_text, translated_text,
        start_ms, end_ms, transcription_confidence, translation_confidence
      FROM call_recording_transcripts
      WHERE recording_id = $1
      ORDER BY COALESCE(sequence_number, 0), start_ms ASC
      `,
      [recordingId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      recordingId: row.recording_id,
      speakerId: row.speaker_id || '',
      originalText: row.original_text || '',
      translatedText: row.translated_text,
      startMs: row.start_ms || 0,
      endMs: row.end_ms || 0,
      transcriptionConfidence: row.transcription_confidence ? parseFloat(row.transcription_confidence) : undefined,
      translationConfidence: row.translation_confidence ? parseFloat(row.translation_confidence) : undefined,
    }));
  } catch (error) {
    console.error('Failed to get transcript:', error);
    throw error;
  }
}
