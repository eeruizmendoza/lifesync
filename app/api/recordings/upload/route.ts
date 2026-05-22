/**
 * POST /api/recordings/upload
 * Upload encrypted recording to S3 and store metadata in database
 * Phase 5: Recording, Encryption & Storage
 *
 * Request body:
 * {
 *   conversationId: string (UUID)
 *   callId: string (from initiateCall)
 *   recordingBuffer: string (base64-encoded audio/video bytes)
 *   recordingType: 'audio' | 'video' | 'screen_share'
 *   mimeType: string (e.g., 'audio/webm', 'video/webm')
 *   durationSeconds: number
 *   encryptionKeyBase64: string (base64-encoded 32-byte XChaCha20 key)
 * }
 *
 * Response:
 * {
 *   success: boolean
 *   recordingId: string
 *   s3Key: string (encrypted S3 object key)
 *   s3Url: string (presigned download URL - 24hr expiry)
 *   size: number (bytes)
 *   uploadedAt: string (ISO timestamp)
 *   expiresAt: string (ISO timestamp - when presigned URL expires)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { uploadRecordingToS3, generatePresignedDownloadUrl } from '@/lib/s3-service';
import {
  createRecordingMetadata,
  getUserStorageUsage,
  logRecordingAccess,
} from '@/lib/database/recordings';
import { requireOrgContext } from '@/lib/tenant-middleware';

export async function POST(request: NextRequest) {
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

    // Phase 3: enforce org storage quota before accepting upload
    if (user.orgId) {
      const { quotaError } = await requireOrgContext(user, { checkQuotas: true, resource: 'storage' });
      if (quotaError) return quotaError;
    }

    // 2. Parse request
    const body = await request.json();
    const {
      conversationId,
      callId,
      recordingBuffer,
      recordingType = 'audio',
      mimeType,
      durationSeconds,
      encryptionKeyBase64,
    } = body;

    // 3. Validate required fields
    if (!conversationId || !callId || !recordingBuffer || !mimeType || !encryptionKeyBase64) {
      return NextResponse.json(
        {
          error: 'Missing required fields: conversationId, callId, recordingBuffer, mimeType, encryptionKeyBase64',
        },
        { status: 400 }
      );
    }

    if (!['audio', 'video', 'screen_share'].includes(recordingType)) {
      return NextResponse.json(
        { error: 'Invalid recording type (must be audio, video, or screen_share)' },
        { status: 400 }
      );
    }

    // 4. Validate and decode encryption key (must be 32 bytes)
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

    // 5. Decode recording buffer
    let recordingBufferDecoded: Buffer;
    try {
      recordingBufferDecoded = Buffer.from(recordingBuffer, 'base64');
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid recording buffer encoding (must be base64)' },
        { status: 400 }
      );
    }

    const fileSizeBytes = recordingBufferDecoded.length;

    // 6. Check storage quota (10GB default)
    const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10GB
    const currentUsageBytes = await getUserStorageUsage(user.id);

    if (currentUsageBytes + fileSizeBytes > STORAGE_QUOTA_BYTES) {
      const remainingBytes = STORAGE_QUOTA_BYTES - currentUsageBytes;
      return NextResponse.json(
        {
          error: `Storage quota exceeded. Used: ${(currentUsageBytes / 1024 / 1024 / 1024).toFixed(2)}GB / 10GB. Remaining: ${(remainingBytes / 1024 / 1024 / 1024).toFixed(2)}GB`,
        },
        { status: 413 }
      );
    }

    // 7. Upload to S3 with encryption
    const s3Result = await uploadRecordingToS3(
      recordingBufferDecoded,
      user.id,
      conversationId,
      encryptionKey,
      {
        filename: `recording-${callId}-${Date.now()}`,
        mimeType,
      }
    );

    console.log(`📹 Recording uploaded to S3: ${s3Result.s3Key} (${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB)`);

    // 8. Create recording metadata in database
    const recordingId = await createRecordingMetadata(
      callId,
      user.id,
      conversationId,
      s3Result.s3Key,
      mimeType,
      fileSizeBytes,
      durationSeconds,
      recordingType as 'audio' | 'video' | 'screen_share',
      true, // isEncrypted
      'XChaCha20-Poly1305'
    );

    console.log(`📝 Recording metadata created: ${recordingId}`);

    // 9. Log access for audit trail
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    await logRecordingAccess(recordingId, user.id, 'view', ipAddress, userAgent);

    // 10. Generate fresh presigned download URL (24 hours)
    const downloadUrl = generatePresignedDownloadUrl(s3Result.s3Key, 86400);
    const expiresAtTimestamp = Date.now() + 86400 * 1000;

    const response = {
      success: true,
      recordingId,
      s3Key: s3Result.s3Key,
      s3Url: downloadUrl,
      size: fileSizeBytes,
      uploadedAt: new Date().toISOString(),
      expiresAt: new Date(expiresAtTimestamp).toISOString(),
    };

    console.log(`✅ Recording upload complete: ${recordingId}`);
    console.log(`   Size: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Type: ${recordingType}`);
    console.log(`   Duration: ${durationSeconds}s`);
    console.log(`   Download URL expires: ${new Date(expiresAtTimestamp).toISOString()}`);

    // 11. Fire-and-forget: Trigger the processing job (integrity check + quality score + transcription)
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const sourceLanguage = body.sourceLanguage || 'en';
    const targetLanguage = body.targetLanguage || 'en';
    fetch(`${baseUrl}/api/jobs/process-recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': process.env.RESEARCH_PIPELINE_CRON_SECRET || '',
      },
      body: JSON.stringify({
        recordingId,
        encryptionKeyBase64,
        sourceLanguage,
        targetLanguage,
      }),
    }).catch((err) => {
      console.error(`Failed to trigger process-recording job for ${recordingId}:`, err);
    });

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Failed to upload recording:', error);

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
 * GET /api/recordings/upload
 * Health check for upload endpoint
 */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      {
        status: 'ready',
        endpoint: 'POST /api/recordings/upload',
        maxFileSize: '10GB per user',
        supportedMimeTypes: [
          'audio/wav',
          'audio/mp3',
          'audio/webm',
          'video/mp4',
          'video/webm',
        ],
        requiresEncryption: true,
        encryptionAlgorithm: 'XChaCha20-Poly1305',
        quotaPerUser: '10GB',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to get upload status:', error);
    return NextResponse.json(
      { error: 'Failed to get upload status' },
      { status: 500 }
    );
  }
}
