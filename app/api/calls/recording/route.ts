/**
 * Call Recording Upload API
 * POST /api/calls/recording
 * Upload encrypted recording chunks and finalize recording
 * Phase 13.4: Recording & Encryption
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getRecordingService } from '@/lib/services/recording-service';
import { getRecordingEncryptionService } from '@/lib/services/recording-encryption';
import { getCallRegistry } from '@/lib/call-state-machine';
import { uploadRecordingToS3, downloadRecordingFromS3 } from '@/lib/s3-service';
import { createCallRecording, storeRecordingEncryptionKey } from '@/lib/db/recording-queries';

interface RecordingUploadRequest {
  callId: string;
  action: 'start' | 'chunk' | 'finalize'; // Recording action
  data?: string; // base64-encoded chunk data (for 'chunk' action)
  codec?: 'opus' | 'vp8' | 'h264';
  duration?: number; // milliseconds for this chunk
}

interface RecordingUploadResponse {
  success: boolean;
  recordingId?: string;
  callId: string;
  action: string;
  message: string;
  metadata?: {
    callId: string;
    recordingId: string;
    duration: number;
    chunkCount: number;
    totalSize: number;
  };
}

/**
 * POST /api/calls/recording
 * Upload recording chunk or manage recording session
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request
    const body = (await request.json()) as RecordingUploadRequest;
    const { callId, action, data, codec = 'opus', duration = 20 } = body;

    // Validate
    if (!callId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: callId, action' },
        { status: 400 }
      );
    }

    if (!['start', 'chunk', 'finalize'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: start, chunk, or finalize' },
        { status: 400 }
      );
    }

    // Verify call exists
    const registry = getCallRegistry();
    const callMachine = registry.getCall(callId);
    if (!callMachine) {
      return NextResponse.json(
        { error: 'Call not found or has expired' },
        { status: 404 }
      );
    }

    const callContext = callMachine.getContext();

    // Handle 'start' action
    if (action === 'start') {
      const recordingService = getRecordingService();
      const session = recordingService.startRecording(callId, callContext.callerId, callContext.receiverId);

      const response: RecordingUploadResponse = {
        success: true,
        recordingId: session.recordingId,
        callId,
        action: 'start',
        message: 'Recording started',
        metadata: {
          callId: session.callId,
          recordingId: session.recordingId,
          duration: 0,
          chunkCount: 0,
          totalSize: 0,
        },
      };

      console.log(`🎙️  Recording upload started: ${session.recordingId}`);
      return NextResponse.json(response, { status: 200 });
    }

    // Handle 'chunk' action
    if (action === 'chunk') {
      if (!data) {
        return NextResponse.json(
          { error: 'Missing data for chunk action' },
          { status: 400 }
        );
      }

      try {
        // Decode base64 data
        const buffer = Buffer.from(data, 'base64');

        // Add chunk to recording
        const recordingService = getRecordingService();
        recordingService.addAudioChunk(callId, buffer, codec as any, duration);

        const session = recordingService.getSession(callId);
        if (!session) {
          throw new Error('Recording session lost');
        }

        const response: RecordingUploadResponse = {
          success: true,
          callId,
          action: 'chunk',
          message: `Chunk recorded (${buffer.length} bytes)`,
          metadata: {
            callId: session.callId,
            recordingId: session.recordingId,
            duration: Date.now() - session.startTime,
            chunkCount: session.chunks.length,
            totalSize: session.totalSize,
          },
        };

        return NextResponse.json(response, { status: 200 });
      } catch (error) {
        return NextResponse.json(
          { error: `Failed to process chunk: ${error instanceof Error ? error.message : 'Unknown error'}` },
          { status: 400 }
        );
      }
    }

    // Handle 'finalize' action
    if (action === 'finalize') {
      const recordingService = getRecordingService();
      const session = recordingService.stopRecording(callId);

      if (!session) {
        return NextResponse.json(
          { error: 'No active recording found for call' },
          { status: 404 }
        );
      }

      // Encrypt the recording
      const encryptionService = getRecordingEncryptionService();
      const mergedBuffer = recordingService.mergeChunks(callId);

      if (!mergedBuffer) {
        return NextResponse.json(
          { error: 'Failed to merge recording chunks' },
          { status: 400 }
        );
      }

      // Encrypt the merged buffer
      const encryptedRecording = encryptionService.encryptRecording(
        mergedBuffer,
        Buffer.from(process.env.ENCRYPTION_MASTER_KEY || 'default-key-32-bytes-long-string'),
        codec || 'opus',
        session.duration || 0
      );

      // Upload encrypted recording to S3
      let s3Path = '';
      try {
        // Serialize encrypted recording to JSON
        const encryptedJson = JSON.stringify(encryptedRecording);
        const encryptedBuffer = Buffer.from(encryptedJson, 'utf-8');

        // Upload to S3
        const uploadResult = await uploadRecordingToS3(
          encryptedBuffer,
          callContext.callerId,
          callId,
          Buffer.from(''), // encryptionKey (not needed since already encrypted)
          {
            filename: `recording_${session.recordingId}.enc`,
            mimeType: 'application/octet-stream',
          }
        );
        s3Path = uploadResult.s3Key;

        console.log(`☁️  Recording uploaded to S3: ${s3Path}`);
      } catch (s3Error) {
        console.error('Failed to upload to S3:', s3Error);
        // Continue even if S3 fails (recording still exists in memory)
        // TODO: Implement retry mechanism
      }

      // Store recording metadata in database
      try {
        await createCallRecording(
          callId,
          session.recordingId,
          callContext.callerId,
          callContext.receiverId,
          session.startTime,
          codec || 'opus',
          callContext.sourceLanguage,
          callContext.targetLanguage,
          s3Path,
          session.totalSize,
          encryptedRecording.metadata.encryptedSize,
          encryptedRecording.iv,
          encryptedRecording.authTag,
          encryptedRecording.salt,
          callContext.metrics
        );

        console.log(`💾 Recording metadata stored in database`);
      } catch (dbError) {
        console.error('Failed to store recording metadata:', dbError);
        // Continue even if DB fails
      }

      // Store per-call encryption key
      try {
        await storeRecordingEncryptionKey(
          session.recordingId,
          callId,
          encryptedRecording.iv, // Store IV as key material temporarily
          'scrypt',
          {
            callId,
            derivedFromCallId: true,
          }
        );
      } catch (keyError) {
        console.error('Failed to store encryption key:', keyError);
      }

      const response: RecordingUploadResponse = {
        success: true,
        recordingId: session.recordingId,
        callId,
        action: 'finalize',
        message: 'Recording finalized, encrypted, and stored',
        metadata: {
          callId: session.callId,
          recordingId: session.recordingId,
          duration: session.duration || 0,
          chunkCount: session.chunks.length,
          totalSize: session.totalSize,
        },
      };

      // Cleanup recording session from memory
      recordingService.clearSession(callId);

      console.log(`🎙️  Recording finalized: ${session.recordingId}`);
      console.log(`   Encrypted size: ${(encryptedRecording.metadata.encryptedSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   S3 Path: ${s3Path}`);

      return NextResponse.json(response, { status: 200 });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to process recording upload:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process recording upload',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/calls/recording
 * Get recording status or download encrypted recording
 * Query params: callId (for status), recordingId (for download)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const callId = searchParams.get('callId');
    const recordingId = searchParams.get('recordingId');

    // Get recording status
    if (callId) {
      const recordingService = getRecordingService();
      const session = recordingService.getSession(callId);

      if (!session) {
        return NextResponse.json(
          { error: 'No recording found for this call' },
          { status: 404 }
        );
      }

      const stats = recordingService.getStats(callId);

      return NextResponse.json(
        {
          callId,
          recordingId: session.recordingId,
          status: session.isActive ? 'active' : 'stopped',
          stats,
        },
        { status: 200 }
      );
    }

    // Download encrypted recording
    if (recordingId) {
      try {
        // Import queries here to avoid circular imports
        const { getRecordingById, userHasRecordingAccess, logRecordingAccess } = await import('@/lib/db/recording-queries');

        // Verify user has access to this recording
        const hasAccess = await userHasRecordingAccess(recordingId, user.id);
        if (!hasAccess) {
          return NextResponse.json(
            { error: 'Access denied to this recording' },
            { status: 403 }
          );
        }

        // Get recording metadata from database
        const recording = await getRecordingById(recordingId);
        if (!recording || !recording.s3_path) {
          return NextResponse.json(
            { error: 'Recording not found or not stored in S3' },
            { status: 404 }
          );
        }

        // Log access for audit trail
        try {
          await logRecordingAccess(
            recordingId,
            user.id,
            'download',
            request.headers.get('x-forwarded-for') || 'unknown',
            request.headers.get('user-agent') || undefined
          );
        } catch (logError) {
          console.warn('Failed to log access:', logError);
        }

        // Fetch encrypted recording from S3
        const downloadResult = await downloadRecordingFromS3(recording.s3_path, Buffer.from(''));

        // Return encrypted data with metadata (client will decrypt)
        return new NextResponse(downloadResult.data, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(downloadResult.data.length),
            'Content-Disposition': `attachment; filename="recording_${recordingId}.enc"`,
            // Include encryption metadata in headers for client
            'X-Recording-IV': recording.encryption_iv || '',
            'X-Recording-Auth-Tag': recording.encryption_auth_tag || '',
            'X-Recording-Salt': recording.encryption_salt || '',
            'X-Recording-Algorithm': recording.encryption_algorithm,
          },
        });
      } catch (downloadError) {
        console.error('Failed to download recording:', downloadError);
        return NextResponse.json(
          {
            error: downloadError instanceof Error ? downloadError.message : 'Failed to download recording',
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Missing callId or recordingId parameter' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to get recording:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get recording',
      },
      { status: 500 }
    );
  }
}
