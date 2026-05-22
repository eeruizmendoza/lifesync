/**
 * Reject Call API
 * POST /api/calls/reject
 * Receiver rejects an incoming call
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';

interface RejectCallRequest {
  callId: string;
  receiverId: string;
  reason?: 'busy' | 'decline' | 'missed'; // Reason for rejection
}

interface RejectCallResponse {
  callId: string;
  status: 'rejected';
  reason: string;
  rejectedAt: number;
}

/**
 * POST /api/calls/reject
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const receiver = await verifyAuthWithTestSupport(authHeader);
    if (!receiver) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request
    const body = (await request.json()) as RejectCallRequest;
    const { callId, receiverId, reason = 'decline' } = body;

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

    // Update call status to 'rejected'
    // TODO: Uncomment when database is ready
    /*
    const updatedCall = await db.conversation.update({
      where: { id: callId },
      data: { status: 'rejected', rejectionReason: reason, endTime: new Date() },
    });
    */

    const response: RejectCallResponse = {
      callId,
      status: 'rejected',
      reason,
      rejectedAt: Date.now(),
    };

    console.log(`❌ Call rejected: ${callId}`);
    console.log(`   Receiver: ${receiverId}`);
    console.log(`   Reason: ${reason}`);

    // TODO: Send notification to caller that call was rejected

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Failed to reject call:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to reject call',
      },
      { status: 500 }
    );
  }
}
