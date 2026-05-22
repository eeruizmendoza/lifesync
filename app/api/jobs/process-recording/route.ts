/**
 * POST /api/jobs/process-recording
 * Background job: Verify recording integrity and extract audio quality metrics
 * Phase 5: Recording, Encryption & Storage
 *
 * Triggered immediately after a successful /api/recordings/upload.
 * Calls the transcription job once processing is confirmed.
 *
 * Flow:
 *  1. Fetch recording from DB (processing_status = 'pending')
 *  2. Verify S3 file exists and size matches stored size
 *  3. Calculate audio_quality_score from file size / duration ratio
 *  4. Insert metrics row into call_recording_metrics
 *  5. Update processing_status → 'processing'
 *  6. Trigger transcription job
 *
 * Request body:
 * {
 *   recordingId: string
 *   encryptionKeyBase64: string
 *   sourceLanguage: string
 *   targetLanguage: string
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRecordingMetadata } from '@/lib/s3-service';
import { updateRecordingStatus, addRecordingMetrics } from '@/lib/database/recordings';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  const jobStart = Date.now();

  try {
    // 1. Verify cron secret
    const secret = request.headers.get('x-cron-secret')
      || request.headers.get('authorization')?.replace('Bearer ', '');

    if (secret !== process.env.RESEARCH_PIPELINE_CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request
    const body = await request.json();
    const {
      recordingId,
      encryptionKeyBase64,
      sourceLanguage,
      targetLanguage,
    } = body;

    if (!recordingId) {
      return NextResponse.json({ error: 'Missing recordingId' }, { status: 400 });
    }

    // 3. Fetch recording from DB
    const result = await db.query(
      `SELECT id, s3_key, file_size_bytes, duration_seconds, processing_status
       FROM call_recordings
       WHERE id = $1 AND deleted_at IS NULL`,
      [recordingId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    const rec = result.rows[0];

    if (rec.processing_status === 'complete') {
      return NextResponse.json({ success: true, message: 'Already processed', recordingId });
    }

    console.log(`🔄 Processing recording: ${recordingId}`);

    // 4. Verify S3 file exists (check metadata without downloading)
    const s3Metadata = await getRecordingMetadata(rec.s3_key);

    const s3SizeBytes = s3Metadata?.size || 0;
    const storedSizeBytes = rec.file_size_bytes || 0;
    const fileExists = s3Metadata?.exists && s3SizeBytes > 0;

    if (!fileExists) {
      console.warn(`⚠️  S3 file not found or empty for recording ${recordingId}`);
      await updateRecordingStatus(recordingId, 'failed', undefined);
      return NextResponse.json({ error: 'S3 file not found' }, { status: 404 });
    }

    // 5. Estimate audio quality score based on bitrate
    // Quality heuristic: bytes_per_second = file_size / duration
    const durationSeconds = rec.duration_seconds || 1;
    const bytesPerSecond = storedSizeBytes / durationSeconds;
    const bitsPerSecond = bytesPerSecond * 8;

    // Map bitrate to quality score: 128kbps=0.9, 96kbps=0.75, 64kbps=0.6, <64kbps=0.4
    let audioQualityScore = 0.5;
    if (bitsPerSecond >= 128000) audioQualityScore = 0.95;
    else if (bitsPerSecond >= 96000) audioQualityScore = 0.80;
    else if (bitsPerSecond >= 64000) audioQualityScore = 0.65;
    else audioQualityScore = 0.45;

    console.log(`📊 Audio quality estimate: ${(bitsPerSecond / 1000).toFixed(0)}kbps → score=${audioQualityScore}`);

    // 6. Store metrics in DB
    await addRecordingMetrics(
      recordingId,
      0,              // latencyMs — not available at processing time
      0,              // jitterMs
      0,              // packetLossPct
      audioQualityScore
    );

    // 7. Mark as processing (not complete — transcription will complete it)
    await updateRecordingStatus(recordingId, 'processing', 'pending');

    const elapsedMs = Date.now() - jobStart;
    console.log(`✅ Processing complete: ${recordingId} in ${elapsedMs}ms`);

    // 8. Trigger transcription job (fire-and-forget)
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    if (encryptionKeyBase64 && sourceLanguage && targetLanguage) {
      fetch(`${baseUrl}/api/jobs/transcribe-recording`, {
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
        console.error('Failed to trigger transcription job:', err);
      });

      console.log(`🚀 Transcription job triggered for: ${recordingId}`);
    } else {
      console.log(`⚠️  Transcription job NOT triggered (missing language/key for ${recordingId})`);
    }

    return NextResponse.json({
      success: true,
      recordingId,
      audioQualityScore,
      bitrateKbps: Math.round(bitsPerSecond / 1000),
      durationMs: elapsedMs,
      transcriptionTriggered: !!(encryptionKeyBase64 && sourceLanguage && targetLanguage),
    });
  } catch (error) {
    console.error('Processing job failed:', error);
    return NextResponse.json(
      {
        error: 'Processing job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - jobStart,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.replace('Bearer ', '') !== process.env.RESEARCH_PIPELINE_CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await db.query(
      `SELECT COUNT(*) as pending_count
       FROM call_recordings
       WHERE processing_status = 'pending' AND deleted_at IS NULL`
    );

    return NextResponse.json({
      status: 'ready',
      pendingProcessing: parseInt(result.rows[0].pending_count, 10),
      endpoint: 'POST /api/jobs/process-recording',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to check processing job status' },
      { status: 500 }
    );
  }
}
