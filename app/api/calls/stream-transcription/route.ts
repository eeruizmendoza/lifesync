/**
 * Streaming Transcription API
 * GET /api/calls/{callId}/stream-transcription
 * Server-Sent Events (SSE) for real-time transcription hypotheses
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getStreamingTranscriptionManager } from '@/lib/streaming-transcription';
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

    const transcriptionManager = getStreamingTranscriptionManager();

    // Create SSE response
    const encoder = new TextEncoder();
    let connectionActive = true;

    const stream = new ReadableStream({
      async start(controller) {
        // Get existing session or create new one
        let session = transcriptionManager.getSession(callId);
        if (!session) {
          session = transcriptionManager.startSession(
            callId,
            context.sourceLanguage,
            'deepgram'
          );
        }

        // Send initial connection message
        const initMessage = `data: ${JSON.stringify({
          type: 'connected',
          callId,
          language: context.sourceLanguage,
          sessionId: session.streamId,
        })}\n\n`;
        controller.enqueue(encoder.encode(initMessage));

        // Register hypothesis callback
        transcriptionManager.onHypothesis(callId, (hypothesis) => {
          if (!connectionActive) return;

          const message = `data: ${JSON.stringify({
            type: hypothesis.isFinal ? 'final' : 'partial',
            text: hypothesis.text,
            language: hypothesis.language,
            confidence: hypothesis.confidence,
            duration: hypothesis.durationMs,
            timestamp: hypothesis.timestamp,
          })}\n\n`;

          try {
            controller.enqueue(encoder.encode(message));
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

          const stats = transcriptionManager.getStats(callId);
          if (stats) {
            const message = `data: ${JSON.stringify({
              type: 'stats',
              totalHypotheses: stats.totalHypotheses,
              averageConfidence: stats.averageConfidence,
              durationMs: stats.sessionDurationMs,
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
    console.error('Stream transcription error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
