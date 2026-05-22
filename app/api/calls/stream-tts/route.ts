/**
 * Streaming TTS API
 * GET /api/calls/{callId}/stream-tts
 * Server-Sent Events (SSE) for real-time synthesized audio chunks
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getStreamingTTSManager } from '@/lib/streaming-tts';
import { getCallRegistry } from '@/lib/call-state-machine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { callId: string } }
) {
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

    const callId = params.callId;

    // Verify call exists
    const callRegistry = getCallRegistry();
    const callMachine = callRegistry.getCall(callId);
    if (!callMachine) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // Verify user is participant in call
    const context = callMachine.getContext();
    if (context.callerId !== user.id && context.receiverId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const ttsManager = getStreamingTTSManager();

    // Create SSE response
    const encoder = new TextEncoder();
    let connectionActive = true;

    const stream = new ReadableStream({
      async start(controller) {
        // Get existing session or create new one
        let session = ttsManager.getSession(callId);
        if (!session) {
          session = ttsManager.startSession(
            callId,
            context.targetLanguage,
            'default-voice',
            'elevenlabs'
          );
        }

        // Send initial connection message
        const initMessage = `data: ${JSON.stringify({
          type: 'connected',
          callId,
          language: context.targetLanguage,
          sessionId: session.sessionId,
        })}\n\n`;
        controller.enqueue(encoder.encode(initMessage));

        // Register synthesis complete callback
        ttsManager.onSynthesisComplete(callId, (chunk, index) => {
          if (!connectionActive) return;

          const message = `data: ${JSON.stringify({
            type: 'chunk_ready',
            chunkIndex: index,
            sentenceNumber: chunk.sentenceNumber,
            durationMs: chunk.duration,
            synthesisTimeMs: chunk.synthesisTimeMs,
            provider: chunk.provider,
            // Note: actual audio buffer sent via separate binary channel
            // This message notifies that the chunk is ready
          })}\n\n`;

          try {
            controller.enqueue(encoder.encode(message));
          } catch (error) {
            connectionActive = false;
            controller.close();
          }
        });

        // Register playback start callback
        ttsManager.onPlaybackStart(callId, (chunkIndex) => {
          if (!connectionActive) return;

          const chunk = ttsManager.getChunk(callId, chunkIndex);
          if (!chunk || !chunk.audioBuffer) return;

          const message = `data: ${JSON.stringify({
            type: 'playback_start',
            chunkIndex,
            durationMs: chunk.duration,
            audioSize: chunk.audioBuffer.length,
          })}\n\n`;

          try {
            controller.enqueue(encoder.encode(message));

            // Send audio as base64 encoded data URL
            const audioBase64 = chunk.audioBuffer.toString('base64');
            const audioMessage = `data: ${JSON.stringify({
              type: 'audio_chunk',
              chunkIndex,
              audio: `data:audio/mp3;base64,${audioBase64}`,
              format: 'mp3',
            })}\n\n`;

            controller.enqueue(encoder.encode(audioMessage));
          } catch (error) {
            connectionActive = false;
            controller.close();
          }
        });

        // Send stats every 2 seconds
        const statsInterval = setInterval(() => {
          if (!connectionActive) {
            clearInterval(statsInterval);
            return;
          }

          const stats = ttsManager.getStats(callId);
          if (stats) {
            const message = `data: ${JSON.stringify({
              type: 'stats',
              totalChunks: stats.totalChunks,
              synthesizedChunks: stats.synthesizedChunks,
              pendingChunks: stats.pendingChunks,
              averageSynthesisTimeMs: stats.averageSynthesisTimeMs,
              totalAudioDurationMs: stats.totalAudioDurationMs,
            })}\n\n`;

            try {
              controller.enqueue(encoder.encode(message));
            } catch (error) {
              connectionActive = false;
              clearInterval(statsInterval);
              controller.close();
            }
          }
        }, 2000);

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          connectionActive = false;
          clearInterval(statsInterval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Stream TTS error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
