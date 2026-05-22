/**
 * GET /api/recordings/metadata?recordingId={id}
 * Return recording metadata + transcripts without downloading the file
 * Phase 5: Recording, Encryption & Storage
 *
 * Used by the RecordingPlayer UI to show duration, status,
 * and inline transcript lines before/while the audio loads.
 *
 * Query parameters:
 * - recordingId: string (required)
 *
 * Response:
 * {
 *   id: string
 *   conversationId: string
 *   recordingType: 'audio' | 'video' | 'screen_share'
 *   mimeType: string
 *   fileSizeBytes: number
 *   durationSeconds: number
 *   processingStatus: 'pending' | 'processing' | 'complete' | 'failed'
 *   transcriptionStatus: 'pending' | 'processing' | 'complete' | 'failed'
 *   createdAt: string
 *   transcripts: TranscriptLine[]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getRecordingById, getTranscriptForRecording } from '@/lib/database/recordings';

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

    if (!recordingId) {
      return NextResponse.json(
        { error: 'Missing recordingId query parameter' },
        { status: 400 }
      );
    }

    // 3. Fetch recording metadata with access control
    const recording = await getRecordingById(recordingId, user.id);

    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found or access denied' },
        { status: 404 }
      );
    }

    // 4. Fetch transcript lines (no decryption needed — transcripts stored plaintext in DB)
    const transcripts = await getTranscriptForRecording(recordingId);

    console.log(`📋 Metadata fetched: ${recordingId} (${transcripts.length} transcript lines)`);

    return NextResponse.json({
      id: recording.id,
      conversationId: recording.conversationId,
      recordingType: recording.recordingType,
      mimeType: recording.mimeType,
      fileSizeBytes: recording.fileSizeBytes,
      durationSeconds: recording.durationSeconds,
      isEncrypted: recording.isEncrypted,
      encryptionAlgorithm: recording.encryptionAlgorithm,
      processingStatus: recording.processingStatus,
      transcriptionStatus: recording.transcriptionStatus,
      createdAt: recording.createdAt,
      updatedAt: recording.updatedAt,
      transcripts,
    });
  } catch (error) {
    console.error('Failed to get recording metadata:', error);
    return NextResponse.json(
      {
        error: 'Failed to get recording metadata',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
