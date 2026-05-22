/**
 * Accept Call API
 * POST /api/calls/accept
 * Receiver accepts an incoming call
 * Enhanced for Phase 13.3: State machine transitions, stream binding
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getMediasoupSFU } from '@/lib/mediasoup-handler';
import { getCallRegistry } from '@/lib/call-state-machine';
import { query } from '@/lib/db';

interface AcceptCallRequest {
  callId: string;
  receiverId: string; // Person accepting the call
}

interface AcceptCallResponse {
  callId: string;
  callerId: string;
  receiverId: string;
  status: 'accepted';
  message: string;
  mediasoupConfig?: {
    routerRtpCapabilities: any;
  };
  acceptedAt: number;
}

/**
 * POST /api/calls/accept
 */
export async function POST(request: NextRequest) {
  try {
    // Verify receiver authentication (supports both production auth and test tokens)
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const receiver = await verifyAuthWithTestSupport(authHeader);
    if (!receiver) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request
    const body = (await request.json()) as AcceptCallRequest;
    const { callId, receiverId } = body;

    // Validate
    if (!callId || !receiverId) {
      return NextResponse.json(
        { error: 'Missing required fields: callId, receiverId' },
        { status: 400 }
      );
    }

    // Verify receiver matches authenticated user
    if (receiver.id !== receiverId) {
      return NextResponse.json(
        { error: 'Receiver ID does not match authenticated user' },
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

    // Verify call is in 'ringing' state
    const callState = callMachine.getState();
    if (callState !== 'ringing') {
      return NextResponse.json(
        { error: `Call is not ringing. Current state: ${callState}` },
        { status: 400 }
      );
    }

    // Transition to 'connecting' state
    try {
      callMachine.transition('connecting');
    } catch (error) {
      return NextResponse.json(
        { error: `Failed to accept call: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 400 }
      );
    }

    // Get Mediasoup configuration
    const sfu = getMediasoupSFU();
    const routerRtpCapabilities = sfu.getRouterRtpCapabilities();

    // Initialize Mediasoup room for this call
    // const room = await sfu.initializeRoom(callId);

    const callContext = callMachine.getContext();
    const response: AcceptCallResponse = {
      callId,
      callerId: callContext.callerId,
      receiverId,
      status: 'accepted',
      message: `Call accepted. Transitioning to connected state.`,
      mediasoupConfig: {
        routerRtpCapabilities,
      },
      acceptedAt: Date.now(),
    };

    // Mark pending call as answered so polling stops
    try {
      await query(
        `UPDATE pending_calls SET status = 'answered', answered_at = NOW()
         WHERE call_id = $1 AND receiver_id = $2::uuid AND status = 'ringing'`,
        [callId, receiverId]
      );
    } catch { /* non-fatal */ }

    console.log(`✅ Call accepted: ${callId}`);
    console.log(`   Receiver: ${receiverId}`);
    console.log(`   Status: connected`);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Failed to accept call:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to accept call',
      },
      { status: 500 }
    );
  }
}
