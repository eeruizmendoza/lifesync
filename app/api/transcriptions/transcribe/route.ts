/**
 * POST /api/transcriptions/transcribe
 *
 * Real-time transcription endpoint for live calls
 *
 * Input:
 * {
 *   audioBase64: string;       // Base64-encoded audio buffer
 *   language: string;           // ISO 639-1 language code (e.g., 'es', 'zh')
 *   callId: string;             // UUID of the conversation
 *   speakerId: string;          // UUID of the speaker (user)
 *   providerId?: string;        // Override provider selection
 * }
 *
 * Output:
 * {
 *   transcriptionId: string;
 *   text: string;
 *   language: string;
 *   confidence: number;         // 0-1
 *   words: Array<{
 *     word: string;
 *     startMs: number;
 *     endMs: number;
 *     confidence: number;
 *   }>;
 *   processingTimeMs: number;
 *   provider: string;
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditLogger } from '@/lib/audit-logger';
import { monitoringService } from '@/lib/monitoring-service';
import { getTranscriptionService } from '@/lib/transcription-service';
import { getClientIP } from '@/lib/audit-logger';
import { requireAuth } from '@/lib/auth';

export const maxDuration = 60; // 60 second timeout

async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIp = getClientIP(request.headers);

  try {
    // Authenticate user
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { audioBase64, language, callId, speakerId, providerId } = body;

    // Validate inputs
    if (!audioBase64 || !language || !callId || !speakerId) {
      return NextResponse.json(
        { error: 'Missing required fields: audioBase64, language, callId, speakerId' },
        { status: 400 }
      );
    }

    // Validate language code
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
      return NextResponse.json(
        { error: 'Invalid language code format' },
        { status: 400 }
      );
    }

    // Decode audio buffer
    let audioBuffer: Buffer;
    try {
      audioBuffer = Buffer.from(audioBase64, 'base64');
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid base64 encoding' },
        { status: 400 }
      );
    }

    // Verify user has access to this call
    const callAccessCheck = await db.query(
      `SELECT id FROM conversations WHERE id = $1 AND (initiator_id = $2 OR contact_id = $2)`,
      [callId, speakerId]
    );

    if (callAccessCheck.rows.length === 0) {
      auditLogger.logSecurity(
        'unauthorized_transcription_attempt',
        'MEDIUM',
        speakerId,
        clientIp,
        { callId }
      );
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Transcribe audio
    const transcriptionService = getTranscriptionService();
    const result = await transcriptionService.transcribeFile(
      audioBuffer,
      language,
      providerId
    );

    // Generate transcription ID
    const transcriptionId = crypto.randomUUID();

    // Store transcription in database
    const dbResult = await db.query(
      `INSERT INTO conversation_transcripts
       (id, conversation_id, speaker_id, original_text, translated_text,
        language_original, language_translated, confidence, created_at)
       VALUES ($1, $2, $3, $4, $4, $5, $5, $6, NOW())
       RETURNING id`,
      [
        transcriptionId,
        callId,
        speakerId,
        result.text,
        language,
        result.confidence,
      ]
    );

    if (dbResult.rows.length === 0) {
      throw new Error('Failed to store transcription');
    }

    // Record metrics
    const processingTime = Date.now() - startTime;
    monitoringService.recordRequestLatency('/api/transcriptions/transcribe', processingTime);
    monitoringService.recordMetric('transcription_confidence', result.confidence, {
      language,
      provider: result.provider,
    });

    // Audit log
    auditLogger.logDataAccess(
      speakerId,
      'transcription',
      transcriptionId,
      clientIp,
      {
        callId,
        language,
        textLength: result.text.length,
        provider: result.provider,
      }
    );

    // Return response
    return NextResponse.json({
      transcriptionId,
      text: result.text,
      language: result.language,
      confidence: result.confidence,
      words: result.segments?.map(seg => ({
        word: seg.text.split(' ')[0], // Simplified: just first word
        startMs: seg.start,
        endMs: seg.end,
        confidence: seg.confidence,
      })) || [],
      processingTimeMs: processingTime,
      provider: result.provider,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log error
    if (error instanceof Error) {
      auditLogger.logError(error, '/api/transcriptions/transcribe', undefined, clientIp);
      monitoringService.recordError(error.constructor.name, '/api/transcriptions/transcribe');
    }

    console.error('Transcription error:', error);

    // Return error response
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Transcription failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { error: 'Use POST to transcribe audio' },
    { status: 405 }
  );
}

// Note: Auth is handled inside POST handler via requireAuth()
