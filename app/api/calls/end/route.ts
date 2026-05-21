/**
 * End Call API
 * POST /api/calls/end
 * Terminate an active call
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getRealtimePipeline } from '@/lib/realtime-pipeline';
import { getMediasoupSFU } from '@/lib/mediasoup-handler';

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

    const user = await verifyAuth(authHeader);
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

    // TODO: Fetch call from database
    // const call = await db.conversation.findUnique({ where: { id: callId } });
    // if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

    const startTime = Date.now(); // TODO: Get actual start time from database

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

    // Update call status in database
    // TODO: Uncomment when database is ready
    /*
    const updatedCall = await db.conversation.update({
      where: { id: callId },
      data: {
        status: 'ended',
        endTime: new Date(),
        duration: Date.now() - call.startTime,
      },
    });
    */

    const duration = Date.now() - startTime;

    const response: EndCallResponse = {
      callId,
      status: 'ended',
      duration,
      endedAt: Date.now(),
      summary: pipelineResult?.summary,
      transcripts: pipelineResult?.transcripts,
    };

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
