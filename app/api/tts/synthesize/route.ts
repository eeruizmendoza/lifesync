import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { synthesizeWithStreaming, selectBestVoiceFor } from '@/lib/tts-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tts/synthesize
 * Synthesize text to speech audio
 *
 * Request body:
 * {
 *   text: string;
 *   language: string;
 *   voiceId?: string;
 *   options?: { emotion?: string; speed?: number };
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { text, language, voiceId, options } = body;

    // Validate inputs
    if (!text || !language) {
      return NextResponse.json(
        { error: 'Missing required fields: text, language' },
        { status: 400 }
      );
    }

    // Select voice if not provided
    let selectedVoiceId = voiceId;
    if (!selectedVoiceId) {
      selectedVoiceId = await selectBestVoiceFor(language);
    }

    // Synthesize audio with streaming
    const audioStream = await synthesizeWithStreaming(text, language, selectedVoiceId, options);

    // Collect audio chunks
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }

    // Combine chunks into single buffer
    const audioBuffer = Buffer.concat(chunks);

    // Return audio as base64
    return NextResponse.json({
      success: true,
      audio: audioBuffer.toString('base64'),
      audioFormat: 'mp3',
      language,
      voiceId: selectedVoiceId,
      textLength: text.length,
      audioDurationMs: Math.round((audioBuffer.length / 16000) * 1000), // Approximate
    });
  } catch (error) {
    console.error('TTS synthesis error:', error);
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
      providers: ['elevenlabs', 'piper', 'google-cloud-tts'],
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Service unavailable' },
      { status: 503 }
    );
  }
}
