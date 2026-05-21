/**
 * POST /api/recordings/upload
 * Upload encrypted recording to S3 and store metadata in database
 *
 * Request body:
 * {
 *   conversationId: string (UUID)
 *   recordingBuffer: ArrayBuffer (base64-encoded)
 *   recordingType: 'audio' | 'video'
 *   mimeType: string (e.g., 'audio/webm', 'video/webm')
 *   durationSeconds: number
 *   encryptionKeyBase64: string (base64-encoded user's conversation key)
 *   filename: string (original filename, for metadata)
 * }
 *
 * Response:
 * {
 *   success: boolean
 *   recordingId: string (UUID)
 *   s3Key: string
 *   s3Url: string (presigned download URL)
 *   size: number (bytes)
 *   uploadedAt: string (ISO timestamp)
 *   expiresAt: string (ISO timestamp - when presigned URL expires)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireAuth } from '@/lib/auth';
import { uploadRecordingToS3 } from '@/lib/s3-service';
import { base64ToUint8Array } from '@/lib/encryption-v2';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth();

    // Parse request body
    const body = await request.json();

    const {
      conversationId,
      recordingBuffer, // base64-encoded
      recordingType,
      mimeType,
      durationSeconds,
      encryptionKeyBase64,
      filename,
    } = body;

    // Validate inputs
    if (!conversationId || !recordingBuffer || !recordingType || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['audio', 'video'].includes(recordingType)) {
      return NextResponse.json(
        { error: 'Invalid recording type' },
        { status: 400 }
      );
    }

    // Verify user owns this conversation
    const conversationCheck = await sql`
      SELECT id, user_id FROM conversations
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `;

    if (!conversationCheck.rows.length) {
      return NextResponse.json(
        { error: 'Conversation not found or access denied' },
        { status: 403 }
      );
    }

    // Decode base64 buffer
    const fileBuffer = Buffer.from(recordingBuffer, 'base64');

    // Validate file size (max 2GB)
    const MAX_SIZE = 2 * 1024 * 1024 * 1024;
    if (fileBuffer.length > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Recording exceeds maximum size (2GB)' },
        { status: 413 }
      );
    }

    // Convert encryption key from base64
    const encryptionKey = base64ToUint8Array(encryptionKeyBase64);

    if (encryptionKey.length !== 32) {
      return NextResponse.json(
        { error: 'Invalid encryption key length' },
        { status: 400 }
      );
    }

    // Upload to S3 (with encryption)
    console.log(`Uploading recording: ${conversationId}, size: ${fileBuffer.length}`);

    const s3Result = await uploadRecordingToS3(
      fileBuffer,
      user.id,
      conversationId,
      encryptionKey,
      {
        filename: filename || `recording-${Date.now()}`,
        mimeType,
      }
    );

    console.log(`S3 upload successful: ${s3Result.s3Key}`);

    // Store metadata in database
    const recordingResult = await sql`
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
        'XChaCha20-Poly1305',
        'complete',
        'pending',
        NOW(),
        NOW() + INTERVAL '1 second' * $7
      )
      RETURNING id, created_at
    `;

    if (!recordingResult.rows.length) {
      throw new Error('Failed to store recording metadata');
    }

    const recordingId = recordingResult.rows[0].id;
    const createdAt = recordingResult.rows[0].created_at;

    // Update conversation's last_message_at
    await sql`
      UPDATE conversations
      SET last_message_at = NOW()
      WHERE id = $1
    `;

    console.log(`Recording metadata saved: ${recordingId}`);

    return NextResponse.json({
      success: true,
      recordingId,
      s3Key: s3Result.s3Key,
      s3Url: s3Result.url,
      size: s3Result.size,
      uploadedAt: createdAt,
      expiresAt: s3Result.expiresAt,
    });
  } catch (error) {
    console.error('Recording upload error:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload recording',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/recordings/upload?conversationId={id}
 * Get presigned upload URL for direct browser upload (optional, for optimization)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const contentType = searchParams.get('contentType') || 'audio/webm';

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Missing conversationId parameter' },
        { status: 400 }
      );
    }

    // Verify user owns this conversation
    const conversationCheck = await sql`
      SELECT id FROM conversations
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `;

    if (!conversationCheck.rows.length) {
      return NextResponse.json(
        { error: 'Conversation not found or access denied' },
        { status: 403 }
      );
    }

    // Note: Direct presigned upload URLs require a separate implementation
    // For now, return a message that client should use POST instead

    return NextResponse.json({
      message: 'Use POST endpoint to upload recordings',
      uploadEndpoint: '/api/recordings/upload',
    });
  } catch (error) {
    console.error('Recording upload info error:', error);
    return NextResponse.json(
      { error: 'Failed to get upload info' },
      { status: 500 }
    );
  }
}
