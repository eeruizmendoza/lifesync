/**
 * Streaming Translation API
 * GET /api/calls/{callId}/stream-translation
 * Server-Sent Events (SSE) for real-time translation batches
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getStreamingTranslationManager } from '@/lib/streaming-translation';
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

    const translationManager = getStreamingTranslationManager();

    // Create SSE response
    const encoder = new TextEncoder();
    let connectionActive = true;

    const stream = new ReadableStream({
      async start(controller) {
        // Get existing session or create new one
        let session = translationManager.getSession(callId);
        if (!session) {
          session = translationManager.startSession(
            callId,
            context.sourceLanguage,
            context.targetLanguage,
            'deepl'
          );
        }

        // Send initial connection message
        const initMessage = `data: ${JSON.stringify({
          type: 'connected',
          callId,
          sourceLang: context.sourceLanguage,
          targetLang: context.targetLanguage,
          sessionId: session.sessionId,
        })}\n\n`;
        controller.enqueue(encoder.encode(initMessage));

        // Register batch callback
        translationManager.onBatch(callId, (batch) => {
          if (!connectionActive) return;

          const message = `data: ${JSON.stringify({
            type: 'batch',
            batchId: batch.batchId,
            chunks: batch.chunks.map((chunk) => ({
              original: chunk.originalText,
              translated: chunk.translatedText,
              sourceLang: chunk.sourceLang,
              targetLang: chunk.targetLang,
              isSentenceEnd: chunk.isSentenceEnd,
              confidence: chunk.confidence,
            })),
            processingTimeMs: batch.processingTimeMs,
            provider: batch.provider,
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

          const stats = translationManager.getStats(callId);
          if (stats) {
            const message = `data: ${JSON.stringify({
              type: 'stats',
              totalBatches: stats.totalBatches,
              totalChunks: stats.totalChunks,
              averageProcessingTimeMs: stats.averageProcessingTimeMs,
              bufferSize: stats.bufferSize,
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
    console.error('Stream translation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
