/**
 * Hold Call API
 * POST /api/calls/hold
 * Place or resume a call on hold
 * Phase 13.3: Call state machine integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getCallRegistry } from '@/lib/call-state-machine';

interface HoldCallRequest {
  callId: string;
  userId: string; // Person putting call on hold
  action: 'hold' | 'resume'; // Hold or resume the call
}

interface HoldCallResponse {
  callId: string;
  status: 'hold' | 'connected';
  action: 'hold' | 'resume';
  message: string;
  heldAt?: number;
  resumedAt?: number;
}

/**
 * POST /api/calls/hold
 * Put a call on hold or resume it
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
    const body = (await request.json()) as HoldCallRequest;
    const { callId, userId, action } = body;

    // Validate
    if (!callId || !userId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: callId, userId, action' },
        { status: 400 }
      );
    }

    if (action !== 'hold' && action !== 'resume') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "hold" or "resume"' },
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

    const currentState = callMachine.getState();
    const callContext = callMachine.getContext();

    // Handle hold action
    if (action === 'hold') {
      // Can only hold if call is connected
      if (currentState !== 'connected') {
        return NextResponse.json(
          { error: `Cannot hold call in state: ${currentState}. Call must be connected.` },
          { status: 400 }
        );
      }

      try {
        callMachine.transition('hold');
      } catch (error) {
        return NextResponse.json(
          { error: `Failed to hold call: ${error instanceof Error ? error.message : 'Unknown error'}` },
          { status: 400 }
        );
      }

      // TODO: Pause audio/video streams
      // TODO: Send hold tone to other participant
      // TODO: Notify other participant that call is on hold

      const response: HoldCallResponse = {
        callId,
        status: 'hold',
        action: 'hold',
        message: 'Call placed on hold',
        heldAt: Date.now(),
      };

      console.log(`📞 Call held: ${callId} (by ${userId})`);
      return NextResponse.json(response, { status: 200 });
    }

    // Handle resume action
    if (action === 'resume') {
      // Can only resume if call is on hold
      if (currentState !== 'hold') {
        return NextResponse.json(
          { error: `Cannot resume call in state: ${currentState}. Call must be on hold.` },
          { status: 400 }
        );
      }

      try {
        callMachine.transition('connected');
      } catch (error) {
        return NextResponse.json(
          { error: `Failed to resume call: ${error instanceof Error ? error.message : 'Unknown error'}` },
          { status: 400 }
        );
      }

      // TODO: Resume audio/video streams
      // TODO: Remove hold tone
      // TODO: Notify other participant that call is resumed

      const response: HoldCallResponse = {
        callId,
        status: 'connected',
        action: 'resume',
        message: 'Call resumed',
        resumedAt: Date.now(),
      };

      console.log(`📞 Call resumed: ${callId} (by ${userId})`);
      return NextResponse.json(response, { status: 200 });
    }

    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to process hold request:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process hold request',
      },
      { status: 500 }
    );
  }
}
