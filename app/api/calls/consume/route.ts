/**
 * Consume Media API
 * POST /api/calls/consume
 * Start receiving audio/video from a producer
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getMediasoupSFU } from '@/lib/mediasoup-handler';

interface ConsumeRequest {
  peerId: string;
  producerId: string;
  rtpCapabilities: any; // WebRTC RTP capabilities
  appData?: Record<string, any>;
}

interface ConsumeResponse {
  peerId: string;
  consumerId: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: any;
  paused: boolean;
  createdAt: number;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuth(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as ConsumeRequest;
    const { peerId, producerId, rtpCapabilities, appData } = body;

    if (!peerId || !producerId || !rtpCapabilities) {
      return NextResponse.json(
        { error: 'Missing required fields: peerId, producerId, rtpCapabilities' },
        { status: 400 }
      );
    }

    if (user.id !== peerId) {
      return NextResponse.json(
        { error: 'Peer ID does not match authenticated user' },
        { status: 403 }
      );
    }

    const sfu = getMediasoupSFU();

    const result = await sfu.consume(
      peerId,
      producerId,
      rtpCapabilities,
      appData
    );

    const response: ConsumeResponse = {
      peerId,
      consumerId: result.consumerId,
      producerId: result.producerId,
      kind: result.kind,
      rtpParameters: result.rtpParameters,
      paused: false,
      createdAt: Date.now(),
    };

    console.log(`✅ Consumer created: ${result.consumerId} (${result.kind})`);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Failed to consume:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to consume media',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/calls/consume/:consumerId/pause
 */
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuth(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    interface PauseRequest {
      peerId: string;
      consumerId: string;
      paused: boolean;
    }

    const body = (await request.json()) as PauseRequest;
    const { peerId, consumerId, paused } = body;

    if (user.id !== peerId) {
      return NextResponse.json(
        { error: 'Peer ID does not match authenticated user' },
        { status: 403 }
      );
    }

    const sfu = getMediasoupSFU();

    if (paused) {
      // TODO: Implement consumer pause in mediasoup-handler
      // await sfu.pauseConsumer(peerId, consumerId);
    } else {
      // TODO: Implement consumer resume in mediasoup-handler
      // await sfu.resumeConsumer(peerId, consumerId);
    }

    return NextResponse.json(
      {
        success: true,
        consumerId,
        paused,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to pause/resume consumer:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to pause/resume',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/calls/consume/:consumerId
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuth(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    interface DeleteRequest {
      peerId: string;
      consumerId: string;
    }

    const body = (await request.json()) as DeleteRequest;
    const { peerId, consumerId } = body;

    if (user.id !== peerId) {
      return NextResponse.json(
        { error: 'Peer ID does not match authenticated user' },
        { status: 403 }
      );
    }

    const sfu = getMediasoupSFU();
    await sfu.closeConsumer(peerId, consumerId);

    return NextResponse.json(
      {
        success: true,
        message: 'Consumer closed',
        consumerId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to close consumer:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to close consumer',
      },
      { status: 500 }
    );
  }
}
