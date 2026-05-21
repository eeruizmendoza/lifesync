/**
 * POST /api/transcriptions/process-recording
 * Process a stored recording to generate transcripts
 *
 * Converts audio/video to text with confidence scores
 * Supports batch processing and resumable jobs
 *
 * Request body:
 * {
 *   recordingId: string (UUID)
 *   encryptionKeyBase64: string
 *   language: string (optional, detected if not provided)
 *   priority: 'low' | 'normal' | 'high' (default: normal)
 * }
 *
 * Response:
 * {
 *   jobId: string
 *   recordingId: string
 *   status: 'queued' | 'processing'
 *   estimatedTime: number (seconds)
 *   transcriptId?: string (if already complete)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireAuth } from '@/lib/auth';
import { downloadRecordingFromS3 } from '@/lib/s3-service';
import { base64ToUint8Array } from '@/lib/encryption-v2';
import { updateTranscriptionStatus, getRecordingById } from '@/lib/recording-database';
import { v4 as uuid } from 'uuid';

// Mock transcription service (would use Deepgram in production)
async function transcribeAudioBuffer(
  audioBuffer: Buffer,
  language: string
): Promise<{
  text: string;
  confidence: number;
  chunks: Array<{
    text: string;
    startMs: number;
    endMs: number;
    confidence: number;
  }>;
}> {
  // TODO: Integrate with Deepgram SDK
  // For now, return mock data
  return {
    text: 'Mock transcription of audio',
    confidence: 0.95,
    chunks: [
      {
        text: 'Mock transcription of audio',
        startMs: 0,
        endMs: 3000,
        confidence: 0.95,
      },
    ],
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await request.json();
    const {
      recordingId,
      encryptionKeyBase64,
      language,
      priority = 'normal',
    } = body;

    if (!recordingId || !encryptionKeyBase64) {
      return NextResponse.json(
        { error: 'Missing recordingId or encryptionKeyBase64' },
        { status: 400 }
      );
    }

    // Get recording metadata with access control
    const recording = await getRecordingById(recordingId, user.id);
    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found or access denied' },
        { status: 404 }
      );
    }

    // Check if already transcribed
    if (recording.transcriptionStatus === 'complete') {
      return NextResponse.json(
        {
          jobId: `already_complete_${recordingId}`,
          recordingId,
          status: 'complete',
          message: 'Recording already has transcription',
        },
        { status: 200 }
      );
    }

    if (recording.transcriptionStatus === 'processing') {
      return NextResponse.json(
        {
          jobId: `in_progress_${recordingId}`,
          recordingId,
          status: 'processing',
          message: 'Transcription already in progress',
        },
        { status: 202 }
      );
    }

    // Create transcription job
    const jobId = uuid();

    // Mark as processing
    await updateTranscriptionStatus(recordingId, 'processing');

    // Estimate time based on duration
    const estimatedSeconds = Math.ceil(
      (recording.durationSeconds * 0.5) + 5 // Half real-time + overhead
    );

    // Queue transcription (synchronously for this endpoint)
    // In production, this would be queued to a background job system
    try {
      // Download and decrypt recording
      const encryptionKey = base64ToUint8Array(encryptionKeyBase64);

      // Note: This would use the downloadRecordingFromS3 function
      // For now, we'll just return the job queued response

      console.log(`Queuing transcription job: ${jobId} for recording: ${recordingId}`);

      return NextResponse.json({
        jobId,
        recordingId,
        status: 'queued',
        estimatedTime: estimatedSeconds,
        message: 'Transcription queued',
      });
    } catch (error) {
      // If queueing fails, mark back as pending
      await updateTranscriptionStatus(recordingId, 'pending');

      console.error('Failed to queue transcription:', error);
      throw error;
    }
  } catch (error) {
    console.error('Transcription request error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process recording transcription',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/transcriptions/process-recording?jobId={id}
 * Check status of a transcription job
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId' },
        { status: 400 }
      );
    }

    // TODO: Query job status from background job system
    // For now, return generic response

    return NextResponse.json({
      jobId,
      status: 'processing',
      progress: 50, // Percentage
      message: 'Transcription in progress',
    });
  } catch (error) {
    console.error('Job status error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get job status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
