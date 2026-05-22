/**
 * GET /api/recordings/download?recordingId={id}&encryptionKeyBase64={key}
 * Download encrypted recording from S3 and decrypt with user's key
 * Phase 5: Recording, Encryption & Storage
 *
 * Query parameters:
 * - recordingId: string (UUID of recording) - required
 * - encryptionKeyBase64: string (base64-encoded 32-byte key) - required
 *
 * Response:
 * Binary audio/video stream with proper content type and security headers
 *
 * Security:
 * - Only conversation participants can download
 * - Recording is decrypted in-memory only
 * - Encrypted S3 key prevents metadata leakage
 * - Access is logged for audit trail
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { downloadRecordingFromS3 } from '@/lib/s3-service';
import { getRecordingById, logRecordingAccess, deleteRecordingLogical } from '@/lib/database/recordings';

export async function GET(request: NextRequest) {
  try {
    // 1. Verify JWT auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse query parameters
    const { searchParams } = new URL(request.url);
    const recordingId = searchParams.get('recordingId');
    const encryptionKeyBase64 = searchParams.get('encryptionKeyBase64');

    if (!recordingId || !encryptionKeyBase64) {
      return NextResponse.json(
        { error: 'Missing recordingId or encryptionKeyBase64' },
        { status: 400 }
      );
    }

    console.log(`📥 Recording download requested: ${recordingId}`);

    // 3. Fetch recording metadata with access control
    const recording = await getRecordingById(recordingId, user.id);

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found or access denied' },
        { status: 404 }
      );
    }

    // 4. Validate S3 key exists
    if (!recording.s3Key) {
      return NextResponse.json(
        { error: 'Recording file not found in storage' },
        { status: 404 }
      );
    }

    // 5. Validate and decode encryption key (must be 32 bytes)
    let encryptionKey: Buffer;
    try {
      encryptionKey = Buffer.from(encryptionKeyBase64, 'base64');
      if (encryptionKey.length !== 32) {
        return NextResponse.json(
          { error: 'Encryption key must be 32 bytes (256 bits)' },
          { status: 400 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid encryption key encoding (must be base64)' },
        { status: 400 }
      );
    }

    // 6. Download from S3 (encrypted) and decrypt
    console.log(`⬇️  Downloading from S3: ${recording.s3Key}`);

    const s3Result = await downloadRecordingFromS3(
      recording.s3Key,
      encryptionKey
    );

    console.log(`✅ Download complete: ${(s3Result.size / 1024 / 1024).toFixed(2)}MB`);

    // 7. Log access for audit trail
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    await logRecordingAccess(recordingId, user.id, 'download', ipAddress, userAgent);

    // 8. Return decrypted audio/video stream
    // Copy Buffer into a fresh ArrayBuffer (BodyInit-compatible)
    const responseBody: ArrayBuffer = s3Result.buffer.buffer.slice(
      s3Result.buffer.byteOffset,
      s3Result.buffer.byteOffset + s3Result.buffer.byteLength
    ) as ArrayBuffer;

    return new NextResponse(responseBody, {
      headers: {
        'Content-Type': s3Result.contentType || recording.mimeType,
        'Content-Length': s3Result.size.toString(),
        'Content-Disposition': `attachment; filename="recording-${recordingId}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Failed to download recording:', error);
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
 * Soft-delete a recording (marks deleted_at, keeps metadata, schedules S3 cleanup)
 */
export async function DELETE(request: NextRequest) {
  try {
    // 1. Verify JWT auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse query parameters
    const { searchParams } = new URL(request.url);
    const recordingId = searchParams.get('recordingId');

    if (!recordingId) {
      return NextResponse.json(
        { error: 'Missing recordingId' },
        { status: 400 }
      );
    }

    // 3. Soft delete (owner only)
    const success = await deleteRecordingLogical(recordingId, user.id);

    if (!success) {
      return NextResponse.json(
        { error: 'Recording not found or access denied' },
        { status: 404 }
      );
    }

    // 4. Log access for audit trail
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    await logRecordingAccess(recordingId, user.id, 'delete', ipAddress, userAgent);

    console.log(`🗑️  Recording soft-deleted: ${recordingId}`);
    console.log(`   Note: S3 file deletion scheduled for 30 days from now`);

    return NextResponse.json({
      success: true,
      recordingId,
      message: 'Recording deleted. Files will be purged after 30 days.',
      deletedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to delete recording:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete recording',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

