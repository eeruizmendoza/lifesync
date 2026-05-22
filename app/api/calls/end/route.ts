/**
 * End Call API
 * POST /api/calls/end
 * Terminate an active call
 * Enhanced for Phase 13.3: State machine transitions, call cleanup
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getRealtimePipeline } from '@/lib/realtime-pipeline';
import { getMediasoupSFU } from '@/lib/mediasoup-handler';
import { getCallRegistry } from '@/lib/call-state-machine';

interface EndCallRequest {
  callId: string;
  userId: string; // Person ending the call
}

interface EndCallResponse {
  callId: string;
  status: 'ended';
  duration: number; // milliseconds
  endedAt: number;
  summary?: {
    totalChunks: number;
    averageLatency: number;
    successRate: number;
  };
  transcripts?: {
    original: Array<{ language: string; text: string }>;
    translated: Array<{ language: string; text: string }>;
  };
}

/**
 * POST /api/calls/end
 */
export async function POST(request: NextRequest) {
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

    // Parse request
    const body = (await request.json()) as EndCallRequest;
    const { callId, userId } = body;

    // Validate
    if (!callId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: callId, userId' },
        { status: 400 }
      );
    }

    // Verify user is part of the call
    if (user.id !== userId) {
      return NextResponse.json(
        { error: 'User ID does not match authenticated user' },
        { status: 403 }
      );
    }

    // Fetch call from state machine registry
    const registry = getCallRegistry();
    const callMachine = registry.getCall(callId);

    if (!callMachine) {
      return NextResponse.json(
        { error: 'Call not found or has expired' },
        { status: 404 }
      );
    }

    const callContext = callMachine.getContext();
    const currentState = callMachine.getState();

    // Can end from various states (not already ended/failed)
    if (callMachine.isTerminal()) {
      return NextResponse.json(
        { error: `Call is already in terminal state: ${currentState}` },
        { status: 400 }
      );
    }

    // Transition to 'ending' state
    try {
      callMachine.transition('ending');
    } catch (error) {
      console.warn(`Failed to transition to ending state: ${error}`);
    }

    // End real-time pipeline (if active)
    const pipeline = getRealtimePipeline();
    let pipelineResult: any = null;

    try {
      pipelineResult = await pipeline.endCall(callId);
    } catch (error) {
      console.warn(`Pipeline end call failed (may not be active): ${error}`);
    }

    // Close Mediasoup room (if exists)
    const sfu = getMediasoupSFU();
    try {
      await sfu.closeRoom(callId);
    } catch (error) {
      console.warn(`SFU room close failed (may not exist): ${error}`);
    }

    // Finalize state transition to 'ended'
    try {
      callMachine.transition('ended');
    } catch (error) {
      console.error(`Failed to finalize call end: ${error}`);
    }

    // Update call status in database
    // TODO: Uncomment when database is ready
    /*
    const updatedCall = await db.conversation.update({
      where: { id: callId },
      data: {
        status: 'ended',
        endTime: new Date(),
        duration: callMachine.getDuration(),
      },
    });
    */

    const duration = callMachine.getDuration();
    const finalContext = callMachine.getContext();

    const response: EndCallResponse = {
      callId,
      status: 'ended',
      duration,
      endedAt: Date.now(),
      summary: {
        totalChunks: pipelineResult?.summary?.totalChunks || 0,
        averageLatency: pipelineResult?.summary?.averageLatency || 0,
        successRate: pipelineResult?.summary?.successRate || 1.0,
        callDurationMs: duration,
        callState: finalContext.currentState,
        metrics: finalContext.metrics || {},
      },
      transcripts: pipelineResult?.transcripts,
    };

    // Remove call from registry (cleanup)
    registry.removeCall(callId);

    console.log(`📞 Call ended: ${callId}`);
    console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`   Ended by: ${userId}`);

    // TODO: Save call recording, transcripts, and metrics to database

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Failed to end call:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to end call',
      },
      { status: 500 }
    );
  }
}
