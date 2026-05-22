import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditLogger } from '@/lib/audit-logger';
import { monitoringService } from '@/lib/monitoring-service';
import { getTTSService } from '@/lib/tts-service';
import { getClientIP } from '@/lib/audit-logger';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/tts/synthesize
 * Synthesize text to speech audio
 *
 * Request body:
 * {
 *   text: string;
 *   language: string;
 *   voiceId?: string;
 *   callId?: string;
 *   options?: { emotion?: 'happy'|'sad'|'neutral'|'excited'|'calm'; speed?: 0.5-2.0 };
 * }
 *
 * Returns:
 * {
 *   audio: string;           // Base64-encoded audio
 *   audioFormat: 'mp3'|'wav';
 *   language: string;
 *   voiceId: string;
 *   processingTimeMs: number;
 *   provider: string;
 *   audioDurationMs: number;
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIp = getClientIP(request.headers);

  try {
    // Require authentication
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { text, language, voiceId, callId, options } = body;

    // Validate inputs
    if (!text || !language) {
      return NextResponse.json(
        { error: 'Missing required fields: text, language' },
        { status: 400 }
      );
    }

    // Validate text length
    if (text.length > 1000) {
      return NextResponse.json(
        { error: 'Text too long (max 1000 characters)' },
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

    // Get TTS service
    const ttsService = getTTSService();

    // Select voice if not provided
    let selectedVoiceId = voiceId;
    if (!selectedVoiceId) {
      selectedVoiceId = await ttsService.selectBestVoiceFor(language);
    }

    // Synthesize text to speech
    const result = await ttsService.synthesize(text, language, selectedVoiceId, options);

    // Record metrics
    const processingTime = Date.now() - startTime;
    monitoringService.recordRequestLatency('/api/tts/synthesize', processingTime);
    monitoringService.recordMetric('tts_audio_duration', result.duration, {
      language,
      provider: result.provider,
    });

    // Store TTS log for analytics
    if (callId) {
      try {
        await db.query(
          `INSERT INTO tts_logs (call_id, user_id, text_length, language, voice_id, provider, duration_ms, processing_time_ms, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [callId, user.id, text.length, language, selectedVoiceId, result.provider, result.duration, processingTime]
        );
      } catch (dbError) {
        console.warn('Failed to log TTS request:', dbError);
        // Continue even if logging fails
      }
    }

    // Audit log
    auditLogger.logDataAccess(
      user.id,
      'tts',
      crypto.randomUUID(),
      clientIp,
      {
        callId,
        language,
        voiceId: selectedVoiceId,
        textLength: text.length,
        provider: result.provider,
        processingTimeMs: processingTime,
      }
    );

    // Return audio as base64
    return NextResponse.json({
      audio: result.audio.toString('base64'),
      audioFormat: result.format,
      language,
      voiceId: selectedVoiceId,
      processingTimeMs: processingTime,
      provider: result.provider,
      audioDurationMs: result.duration,
      sampleRate: result.sampleRate,
      channels: result.channels,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log error
    if (error instanceof Error) {
      auditLogger.logError(error, '/api/tts/synthesize', user?.id, clientIp);
      monitoringService.recordError(error.constructor.name, '/api/tts/synthesize');
    }

    console.error('TTS synthesis error:', error);

    // Return error response
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Synthesis failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tts/synthesize
 * Get TTS service status or health check
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      status: 'ok',
      service: 'text-to-speech',
      timestamp: new Date().toISOString(),
      providers: ['ElevenLabs-v3', 'Kokoro-TTS', 'Piper-TTS', 'Google-Cloud-TTS-v3'],
      supportedLanguages: ['en', 'es', 'zh', 'fr', 'de', 'it', 'ja', 'ko', 'ru', 'ar', 'pt'],
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
