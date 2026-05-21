/**
 * Recording Database Integration
 * Stores recording metadata and manages conversation recording history
 */

import { sql } from '@vercel/postgres';
import { EncryptedRecording } from './recording-service';
import { uploadRecordingToS3, S3UploadResult } from './s3-service';

export interface ConversationRecordingMetadata {
  id: string;
  conversationId: string;
  userId: string;
  recordingType: 'audio' | 'video';
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
  createdAt: Date;
  s3Key: string;
  s3PresignedUrl: string;
  transcriptionStatus: 'pending' | 'processing' | 'complete' | 'failed';
  processingStatus: 'complete' | 'processing' | 'failed';
}

/**
 * Save encrypted recording to database and S3
 * Called after finalizeRecording() completes
 *
 * @param conversationId - The conversation this recording belongs to
 * @param userId - Owner of the recording
 * @param encryptedRecording - The encrypted recording object from recording-service
 * @param recordingFileBuffer - The raw audio/video file buffer
 * @param encryptionKey - Encryption key for S3 upload
 * @returns Metadata about stored recording
 */
export async function saveRecordingToDatabase(
  conversationId: string,
  userId: string,
  encryptedRecording: EncryptedRecording,
  recordingFileBuffer: Buffer,
  encryptionKey: Uint8Array
): Promise<ConversationRecordingMetadata> {
  try {
    // First, upload to S3 (encrypted)
    console.log(`Saving recording to S3: conversation=${conversationId}, size=${recordingFileBuffer.length}`);

    const s3Result = await uploadRecordingToS3(
      recordingFileBuffer,
      userId,
      conversationId,
      encryptionKey,
      {
        filename: `recording-${Date.now()}`,
        mimeType: encryptedRecording.metadata.contentType === 'video'
          ? 'video/webm'
          : 'audio/webm',
      }
    );

    console.log(`S3 upload complete: ${s3Result.s3Key}`);

    // Then store metadata in database
    const result = await sql`
      INSERT INTO conversation_recordings (
        conversation_id,
        user_id,
        recording_type,
        s3_url,
        mime_type,
        file_size_bytes,
        duration_seconds,
        is_encrypted,
        encryption_algorithm,
        processing_status,
        transcription_status,
        start_time,
        end_time
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        true,
        $8,
        'complete',
        'pending',
        NOW(),
        NOW() + INTERVAL '1 second' * $7
      )
      RETURNING
        id,
        conversation_id,
        user_id,
        recording_type,
        mime_type,
        file_size_bytes,
        duration_seconds,
        created_at
    `;

    if (!result.rows.length) {
      throw new Error('Failed to insert recording metadata');
    }

    const row = result.rows[0];

    // Update conversation's last_message_at
    await sql`
      UPDATE conversations
      SET last_message_at = NOW()
      WHERE id = $1
    `;

    console.log(`Recording saved: ${row.id}`);

    return {
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      recordingType: row.recording_type,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes,
      durationSeconds: row.duration_seconds,
      createdAt: row.created_at,
      s3Key: s3Result.s3Key,
      s3PresignedUrl: s3Result.url,
      transcriptionStatus: 'pending',
      processingStatus: 'complete',
    };
  } catch (error) {
    console.error('Failed to save recording:', error);
    throw new Error(`Recording save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get recording by ID with access control
 * @param recordingId - UUID of recording
 * @param userId - User requesting access
 * @returns Recording metadata or null if not found/no access
 */
export async function getRecordingById(
  recordingId: string,
  userId: string
): Promise<ConversationRecordingMetadata | null> {
  try {
    const result = await sql`
      SELECT
        cr.id,
        cr.conversation_id,
        cr.user_id,
        cr.recording_type,
        cr.mime_type,
        cr.file_size_bytes,
        cr.duration_seconds,
        cr.created_at,
        cr.s3_url,
        cr.transcription_status,
        cr.processing_status,
        c.contact_id
      FROM conversation_recordings cr
      JOIN conversations c ON cr.conversation_id = c.id
      WHERE cr.id = $1 AND cr.deleted_at IS NULL
      LIMIT 1
    `;

    if (!result.rows.length) {
      return null;
    }

    const row = result.rows[0];

    // Access control: owner or contact
    if (row.user_id !== userId && row.contact_id !== userId) {
      return null;
    }

    return {
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      recordingType: row.recording_type,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes,
      durationSeconds: row.duration_seconds,
      createdAt: row.created_at,
      s3Key: row.s3_url,
      s3PresignedUrl: '', // Would need to be regenerated
      transcriptionStatus: row.transcription_status,
      processingStatus: row.processing_status,
    };
  } catch (error) {
    console.error('Failed to get recording:', error);
    return null;
  }
}

/**
 * Get all recordings for a conversation
 * @param conversationId - UUID of conversation
 * @param userId - User requesting (for access control)
 * @returns Array of recording metadata
 */
export async function getConversationRecordings(
  conversationId: string,
  userId: string
): Promise<ConversationRecordingMetadata[]> {
  try {
    // Verify access to conversation
    const conversationCheck = await sql`
      SELECT user_id, contact_id
      FROM conversations
      WHERE id = $1
      LIMIT 1
    `;

    if (!conversationCheck.rows.length) {
      return [];
    }

    const conv = conversationCheck.rows[0];
    if (conv.user_id !== userId && conv.contact_id !== userId) {
      return [];
    }

    const result = await sql`
      SELECT
        id,
        conversation_id,
        user_id,
        recording_type,
        mime_type,
        file_size_bytes,
        duration_seconds,
        created_at,
        s3_url,
        transcription_status,
        processing_status
      FROM conversation_recordings
      WHERE conversation_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;

    return result.rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      recordingType: row.recording_type,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes,
      durationSeconds: row.duration_seconds,
      createdAt: row.created_at,
      s3Key: row.s3_url,
      s3PresignedUrl: '',
      transcriptionStatus: row.transcription_status,
      processingStatus: row.processing_status,
    }));
  } catch (error) {
    console.error('Failed to get conversation recordings:', error);
    return [];
  }
}

/**
 * Update recording transcription status
 * Called by transcription worker after processing
 * @param recordingId - UUID of recording
 * @param status - New transcription status
 */
export async function updateTranscriptionStatus(
  recordingId: string,
  status: 'pending' | 'processing' | 'complete' | 'failed'
): Promise<void> {
  try {
    await sql`
      UPDATE conversation_recordings
      SET transcription_status = $1, updated_at = NOW()
      WHERE id = $2
    `;

    console.log(`Updated transcription status: ${recordingId} -> ${status}`);
  } catch (error) {
    console.error('Failed to update transcription status:', error);
  }
}

/**
 * Soft delete a recording
 * Keeps metadata for recovery, marks file for cleanup
 * @param recordingId - UUID of recording
 * @param userId - User deleting (for access control)
 * @returns Success status
 */
export async function deleteRecording(
  recordingId: string,
  userId: string
): Promise<boolean> {
  try {
    // Verify ownership
    const result = await sql`
      SELECT user_id FROM conversation_recordings
      WHERE id = $1
      LIMIT 1
    `;

    if (!result.rows.length) {
      return false;
    }

    if (result.rows[0].user_id !== userId) {
      return false; // Access denied
    }

    // Soft delete
    await sql`
      UPDATE conversation_recordings
      SET deleted_at = NOW()
      WHERE id = $1
    `;

    console.log(`Recording deleted: ${recordingId}`);
    return true;
  } catch (error) {
    console.error('Failed to delete recording:', error);
    return false;
  }
}

/**
 * Get storage usage for a user
 * Used for quota enforcement
 * @param userId - User to calculate usage for
 * @returns Bytes used and quota status
 */
export async function getUserRecordingStorageUsage(userId: string): Promise<{
  usedBytes: number;
  recordingCount: number;
  quotaBytes: number;
  percentUsed: number;
}> {
  try {
    const result = await sql`
      SELECT
        COALESCE(SUM(file_size_bytes), 0) as total_bytes,
        COUNT(*) as recording_count
      FROM conversation_recordings
      WHERE user_id = $1 AND deleted_at IS NULL
    `;

    if (!result.rows.length) {
      return {
        usedBytes: 0,
        recordingCount: 0,
        quotaBytes: 10 * 1024 * 1024 * 1024, // 10GB
        percentUsed: 0,
      };
    }

    const row = result.rows[0];
    const usedBytes = parseInt(row.total_bytes);
    const recordingCount = parseInt(row.recording_count);
    const quotaBytes = 10 * 1024 * 1024 * 1024; // 10GB per user

    return {
      usedBytes,
      recordingCount,
      quotaBytes,
      percentUsed: (usedBytes / quotaBytes) * 100,
    };
  } catch (error) {
    console.error('Failed to get storage usage:', error);
    return {
      usedBytes: 0,
      recordingCount: 0,
      quotaBytes: 10 * 1024 * 1024 * 1024,
      percentUsed: 0,
    };
  }
}

/**
 * Get recordings pending transcription
 * Used by transcription worker to find work
 * @param limit - Max records to return
 * @returns Array of recording IDs
 */
export async function getRecordingsPendingTranscription(limit: number = 10): Promise<string[]> {
  try {
    const result = await sql`
      SELECT id
      FROM conversation_recordings
      WHERE transcription_status = 'pending' AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `;

    return result.rows.map(row => row.id);
  } catch (error) {
    console.error('Failed to get pending transcriptions:', error);
    return [];
  }
}
