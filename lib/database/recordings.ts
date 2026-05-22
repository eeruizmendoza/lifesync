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
 * Get recording by ID with access control
 */
export async function getRecordingById(
  recordingId: string,
  userId: string
): Promise<ConversationRecordingMetadata | null> {
  try {
    const result = await db.query(
      `
      SELECT
        id, conversation_id, user_id, recording_type, mime_type,
        file_size_bytes, duration_seconds, is_encrypted, encryption_algorithm,
        processing_status, transcription_status, s3_key, created_at, updated_at
      FROM call_recordings
      WHERE id = $1 AND (caller_id = $2 OR receiver_id = $2)
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
      fileSizeBytes: row.file_size_bytes,
      durationSeconds: row.duration_seconds,
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
      WHERE conversation_id = $1 AND (caller_id = $2 OR receiver_id = $2) AND deleted_at IS NULL
      `,
      [conversationId, userId]
    );

    const total = parseInt(countResult.rows[0].total, 10);

    // Get paginated results
    const result = await db.query(
      `
      SELECT
        id, conversation_id, user_id, recording_type, mime_type,
        file_size_bytes, duration_seconds, is_encrypted, encryption_algorithm,
        processing_status, transcription_status, s3_key, created_at, updated_at
      FROM call_recordings
      WHERE conversation_id = $1 AND (caller_id = $2 OR receiver_id = $2) AND deleted_at IS NULL
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
      fileSizeBytes: row.file_size_bytes,
      durationSeconds: row.duration_seconds,
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
 * Create recording metadata
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
    const recordingId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await db.query(
      `
      INSERT INTO call_recordings (
        id, call_id, conversation_id, user_id, recording_type, mime_type,
        file_size_bytes, duration_seconds, is_encrypted, encryption_algorithm,
        s3_key, processing_status, transcription_status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      `,
      [
        recordingId,
        callId,
        conversationId,
        userId,
        recordingType,
        mimeType,
        fileSizeBytes,
        durationSeconds,
        isEncrypted,
        encryptionAlgorithm,
        s3Key,
        'pending',
        'pending',
      ]
    );

    return recordingId;
  } catch (error) {
    console.error('Failed to create recording metadata:', error);
    throw error;
  }
}

/**
 * Update recording processing/transcription status
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
      `UPDATE call_recordings SET ${updates.join(', ')} WHERE id = $${paramCount}`,
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
      WHERE id = $1 AND user_id = $2
      RETURNING id
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
 * Add transcript line for a recording
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
    const transcriptId = `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await db.query(
      `
      INSERT INTO call_recording_transcripts (
        id, recording_id, speaker_id, original_text, translated_text,
        start_ms, end_ms, transcription_confidence, translation_confidence, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `,
      [
        transcriptId,
        recordingId,
        speakerId,
        originalText,
        translatedText || null,
        startMs,
        endMs,
        transcriptionConfidence || 0,
        translationConfidence || 0,
      ]
    );

    return transcriptId;
  } catch (error) {
    console.error('Failed to add transcript line:', error);
    throw error;
  }
}

/**
 * Get all transcript lines for a recording
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
      ORDER BY start_ms ASC
      `,
      [recordingId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      recordingId: row.recording_id,
      speakerId: row.speaker_id,
      originalText: row.original_text,
      translatedText: row.translated_text,
      startMs: row.start_ms,
      endMs: row.end_ms,
      transcriptionConfidence: row.transcription_confidence,
      translationConfidence: row.translation_confidence,
    }));
  } catch (error) {
    console.error('Failed to get transcript:', error);
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
        recording_id, latency_ms, jitter_ms, packet_loss_percent,
        audio_quality_score, video_quality_score, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
      [recordingId, latencyMs, jitterMs, packetLossPct, audioQualityScore, videoQualityScore || null]
    );
  } catch (error) {
    console.error('Failed to add recording metrics:', error);
    throw error;
  }
}

/**
 * Get user's total storage usage
 */
export async function getUserStorageUsage(userId: string): Promise<number> {
  try {
    const result = await db.query(
      `
      SELECT COALESCE(SUM(file_size_bytes), 0) as total_bytes
      FROM call_recordings
      WHERE user_id = $1 AND deleted_at IS NULL
      `,
      [userId]
    );

    return parseInt(result.rows[0].total_bytes, 10);
  } catch (error) {
    console.error('Failed to get user storage usage:', error);
    throw error;
  }
}
