/**
 * GET /api/recordings/download?recordingId={id}
 * Download encrypted recording from S3 and decrypt with user's key
 *
 * Query parameters:
 * - recordingId: string (UUID of recording)
 * - encryptionKeyBase64: string (base64-encoded user's conversation key)
 *
 * Response:
 * Binary audio/video stream with proper content type
 *
 * Security:
 * - Only conversation participants can download
 * - Recording is decrypted in-memory only
 * - Encrypted S3 key prevents metadata leakage
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireAuth } from '@/lib/auth';
import { downloadRecordingFromS3 } from '@/lib/s3-service';
import { base64ToUint8Array } from '@/lib/encryption-v2';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const recordingId = searchParams.get('recordingId');
    const encryptionKeyBase64 = searchParams.get('encryptionKeyBase64');

    if (!recordingId || !encryptionKeyBase64) {
      return NextResponse.json(
        { error: 'Missing recordingId or encryptionKeyBase64' },
        { status: 400 }
      );
    }

    console.log(`Recording download requested: ${recordingId}`);

    // Fetch recording metadata from database
    const recordingQuery = await sql`
      SELECT
        cr.id,
        cr.conversation_id,
        cr.user_id,
        cr.s3_url,
        cr.mime_type,
        cr.file_size_bytes,
        cr.duration_seconds,
        c.user_id as conv_user_id,
        c.contact_id as conv_contact_id
      FROM conversation_recordings cr
      JOIN conversations c ON cr.conversation_id = c.id
      WHERE cr.id = $1
      LIMIT 1
    `;

    if (!recordingQuery.rows.length) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      );
    }

    const recording = recordingQuery.rows[0];

    // Verify access control
    // Only the owner or the contact can download
    const isOwner = recording.user_id === user.id;
    const isContact = recording.conv_contact_id === user.id;
    const isConversationParticipant = recording.conv_user_id === user.id;

    if (!isOwner && !isContact && !isConversationParticipant) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Validate S3 key exists
    if (!recording.s3_url) {
      return NextResponse.json(
        { error: 'Recording file not found in storage' },
        { status: 404 }
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

    // Download from S3 (encrypted) and decrypt
    console.log(`Downloading from S3: ${recording.s3_url}`);

    const decryptedResult = await downloadRecordingFromS3(
      recording.s3_url,
      encryptionKey
    );

    console.log(`Download complete: ${decryptedResult.size} bytes`);

    // Update last accessed timestamp
    await sql`
      UPDATE conversation_recordings
      SET updated_at = NOW()
      WHERE id = $1
    `;

    // Return decrypted audio/video stream
    // Convert to Uint8Array for compatibility with NextResponse
    const bodyBuffer = new Uint8Array(
      decryptedResult.buffer instanceof ArrayBuffer
        ? decryptedResult.buffer
        : Buffer.isBuffer(decryptedResult.buffer)
          ? decryptedResult.buffer.buffer
          : decryptedResult.buffer
    );

    return new NextResponse(bodyBuffer as any, {
      headers: {
        'Content-Type': decryptedResult.contentType || recording.mime_type,
        'Content-Length': decryptedResult.size.toString(),
        'Content-Disposition': `attachment; filename="recording-${recordingId}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Recording download error:', error);
    return NextResponse.json(
      {
        error: 'Failed to download recording',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/recordings/download?recordingId={id}
 * Delete a recording (soft delete, keeps metadata)
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth();

    const { searchParams } = new URL(request.url);
    const recordingId = searchParams.get('recordingId');

    if (!recordingId) {
      return NextResponse.json(
        { error: 'Missing recordingId' },
        { status: 400 }
      );
    }

    // Fetch recording
    const recordingQuery = await sql`
      SELECT cr.id, cr.user_id, cr.s3_url
      FROM conversation_recordings cr
      WHERE cr.id = $1
      LIMIT 1
    `;

    if (!recordingQuery.rows.length) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      );
    }

    const recording = recordingQuery.rows[0];

    // Verify ownership
    if (recording.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Only owner can delete recording' },
        { status: 403 }
      );
    }

    // Soft delete in database
    await sql`
      UPDATE conversation_recordings
      SET deleted_at = NOW()
      WHERE id = $1
    `;

    // Note: S3 file deletion is handled separately by cleanup job
    // This keeps recording recoverable for a period

    console.log(`Recording soft-deleted: ${recordingId}`);

    return NextResponse.json({
      success: true,
      recordingId,
      message: 'Recording deleted',
    });
  } catch (error) {
    console.error('Recording deletion error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete recording',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recordings/download (metadata request)
 * Get recording metadata without downloading full file
 *
 * Request body:
 * {
 *   recordingId: string (UUID)
 * }
 *
 * Response:
 * {
 *   id: string
 *   conversationId: string
 *   recordingType: 'audio' | 'video'
 *   mimeType: string
 *   fileSizeBytes: number
 *   durationSeconds: number
 *   createdAt: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await request.json();
    const { recordingId } = body;

    if (!recordingId) {
      return NextResponse.json(
        { error: 'Missing recordingId' },
        { status: 400 }
      );
    }

    // Fetch recording metadata
    const recordingQuery = await sql`
      SELECT
        cr.id,
        cr.conversation_id,
        cr.recording_type,
        cr.mime_type,
        cr.file_size_bytes,
        cr.duration_seconds,
        cr.created_at,
        cr.user_id,
        c.contact_id
      FROM conversation_recordings cr
      JOIN conversations c ON cr.conversation_id = c.id
      WHERE cr.id = $1 AND cr.deleted_at IS NULL
      LIMIT 1
    `;

    if (!recordingQuery.rows.length) {
      return NextResponse.json(
        { error: 'Recording not found' },
        { status: 404 }
      );
    }

    const recording = recordingQuery.rows[0];

    // Verify access
    if (recording.user_id !== user.id && recording.contact_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      id: recording.id,
      conversationId: recording.conversation_id,
      recordingType: recording.recording_type,
      mimeType: recording.mime_type,
      fileSizeBytes: recording.file_size_bytes,
      durationSeconds: recording.duration_seconds,
      createdAt: recording.created_at,
    });
  } catch (error) {
    console.error('Recording metadata error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get recording metadata',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
