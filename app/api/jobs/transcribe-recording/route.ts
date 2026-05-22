/**
 * POST /api/jobs/transcribe-recording
 * Background job: Transcribe + translate a recording using Whisper + DeepL
 * Phase 5: Recording, Encryption & Storage
 *
 * Triggered automatically when a recording's processingStatus = 'pending'.
 * Protected by RESEARCH_PIPELINE_CRON_SECRET to prevent unauthorized execution.
 *
 * Flow:
 *  1. Fetch recording from DB (processing_status = 'pending' + transcription_status = 'pending')
 *  2. Download encrypted file from S3
 *  3. Decrypt using stored key
 *  4. Transcribe audio with Whisper (speaker diarization if possible)
 *  5. Translate transcript to target language via DeepL ensemble
 *  6. Store transcript lines in call_recording_transcripts
 *  7. Update recording status → transcription_status = 'complete'
 *
 * Request body:
 * {
 *   recordingId: string
 *   encryptionKeyBase64: string  (base64-encoded 32-byte key)
 *   sourceLanguage: string       (e.g. 'en', 'es', 'zh')
 *   targetLanguage: string       (e.g. 'es', 'en', 'zh')
 * }
 *
 * Response:
 * {
 *   success: boolean
 *   recordingId: string
 *   transcriptLineCount: number
 *   durationMs: number
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { downloadRecordingFromS3 } from '@/lib/s3-service';
import { getTranscriptionService } from '@/lib/transcription-service';
import { getTranslationService } from '@/lib/translation-service';
import {
  getRecordingById,
  updateRecordingStatus,
  addTranscriptLine,
} from '@/lib/database/recordings';
import { db } from '@/lib/db';

// ============================================================================
// POST handler — Transcription Job
// ============================================================================

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

    if (!recordingId || !encryptionKeyBase64 || !sourceLanguage || !targetLanguage) {
      return NextResponse.json(
        { error: 'Missing required fields: recordingId, encryptionKeyBase64, sourceLanguage, targetLanguage' },
        { status: 400 }
      );
    }

    // 3. Validate encryption key
    let encryptionKey: Buffer;
    try {
      encryptionKey = Buffer.from(encryptionKeyBase64, 'base64');
      if (encryptionKey.length !== 32) {
        return NextResponse.json({ error: 'Encryption key must be 32 bytes' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid encryption key encoding' }, { status: 400 });
    }

    // 4. Fetch recording metadata (no userId check — this is a system job)
    const recordingRow = await db.query(
      `SELECT id, s3_key, mime_type, duration_seconds, caller_id
       FROM call_recordings
       WHERE id = $1 AND deleted_at IS NULL`,
      [recordingId]
    );

    if (recordingRow.rows.length === 0) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    const rec = recordingRow.rows[0];

    // 5. Mark as processing
    await updateRecordingStatus(recordingId, 'processing', 'processing');
    console.log(`🔄 Transcription started: ${recordingId}`);

    // 6. Download and decrypt from S3
    const s3Result = await downloadRecordingFromS3(rec.s3_key, encryptionKey);
    console.log(`⬇️  Downloaded ${(s3Result.size / 1024 / 1024).toFixed(2)}MB for transcription`);

    // 7. Transcribe with Whisper
    const transcriptionService = getTranscriptionService();
    const transcription = await transcriptionService.transcribeFile(
      s3Result.buffer,
      sourceLanguage
    );

    console.log(`📝 Transcription complete: "${transcription.text.substring(0, 60)}..."`);
    console.log(`   Confidence: ${(transcription.confidence * 100).toFixed(1)}%`);

    // 8. Translate to target language
    const translationService = getTranslationService();
    const translation = await translationService.translateWithEnsemble(
      transcription.text,
      sourceLanguage,
      targetLanguage
    );

    console.log(`🌐 Translation complete: "${translation.text.substring(0, 60)}..."`);
    console.log(`   Confidence: ${(translation.confidence * 100).toFixed(1)}%`);

    // 9. Store transcript line in DB
    const durationMs = (rec.duration_seconds || 0) * 1000;

    const transcriptId = await addTranscriptLine(
      recordingId,
      rec.caller_id,       // speaker = the caller
      transcription.text,  // original language
      translation.text,    // translated language
      0,                   // start_ms
      durationMs,          // end_ms (full duration — segment-level breakdown is future work)
      transcription.confidence,
      translation.confidence
    );

    console.log(`✅ Transcript stored: ${transcriptId}`);

    // 10. Update recording status → complete
    await updateRecordingStatus(recordingId, 'complete', 'complete');

    const elapsedMs = Date.now() - jobStart;
    console.log(`✅ Transcription job complete: ${recordingId} in ${elapsedMs}ms`);

    return NextResponse.json({
      success: true,
      recordingId,
      transcriptLineCount: 1,
      durationMs: elapsedMs,
      transcript: {
        original: transcription.text,
        translated: translation.text,
        sourceLanguage,
        targetLanguage,
        confidence: {
          transcription: transcription.confidence,
          translation: translation.confidence,
        },
      },
    });
  } catch (error) {
    console.error('Transcription job failed:', error);

    // Try to mark recording as failed
    try {
      const body = await request.json().catch(() => ({}));
      if (body.recordingId) {
        await updateRecordingStatus(body.recordingId, 'failed', 'failed');
      }
    } catch {
      // Ignore secondary failure
    }

    return NextResponse.json(
      {
        error: 'Transcription job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - jobStart,
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET handler — Job Status Check
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.replace('Bearer ', '') !== process.env.RESEARCH_PIPELINE_CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Return count of pending transcriptions
    const result = await db.query(
      `SELECT COUNT(*) as pending_count
       FROM call_recordings
       WHERE transcription_status = 'pending' AND deleted_at IS NULL`
    );

    const pendingCount = parseInt(result.rows[0].pending_count, 10);

    return NextResponse.json({
      status: 'ready',
      pendingTranscriptions: pendingCount,
      endpoint: 'POST /api/jobs/transcribe-recording',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to check transcription job status' },
      { status: 500 }
    );
  }
}
