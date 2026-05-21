/**
 * Accept Call API
 * POST /api/calls/accept
 * Receiver accepts an incoming call
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getMediasoupSFU } from '@/lib/mediasoup-handler';

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
    // Verify receiver authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const receiver = await verifyAuth(authHeader);
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

    // TODO: Fetch call from database
    // const call = await db.conversation.findUnique({ where: { id: callId } });
    // if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    // if (call.status !== 'ringing') return NextResponse.json({ error: 'Call is not ringing' }, { status: 400 });

    // Update call status to 'connected'
    // TODO: Uncomment when database is ready
    /*
    const updatedCall = await db.conversation.update({
      where: { id: callId },
      data: { status: 'connected', connectedAt: new Date() },
    });
    */

    // Get Mediasoup configuration
    const sfu = getMediasoupSFU();
    const routerRtpCapabilities = sfu.getRouterRtpCapabilities();

    // Initialize Mediasoup room for this call
    // const room = await sfu.initializeRoom(callId);

    const response: AcceptCallResponse = {
      callId,
      callerId: 'caller-id-placeholder', // TODO: Get from database
      receiverId,
      status: 'accepted',
      message: `Call accepted. Connection established.`,
      mediasoupConfig: {
        routerRtpCapabilities,
      },
      acceptedAt: Date.now(),
    };

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
