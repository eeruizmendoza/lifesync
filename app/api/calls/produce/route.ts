/**
 * Produce Media API
 * POST /api/calls/produce
 * Start sending audio/video from a peer
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getMediasoupSFU } from '@/lib/mediasoup-handler';

interface ProduceRequest {
  peerId: string;
  kind: 'audio' | 'video';
  rtpParameters: any; // WebRTC RTP parameters
  appData?: Record<string, any>;
}

interface ProduceResponse {
  peerId: string;
  producerId: string;
  kind: 'audio' | 'video';
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

    const body = (await request.json()) as ProduceRequest;
    const { peerId, kind, rtpParameters, appData } = body;

    if (!peerId || !kind || !rtpParameters) {
      return NextResponse.json(
        { error: 'Missing required fields: peerId, kind, rtpParameters' },
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

    const result = await sfu.produce(peerId, {
      kind,
      rtpParameters,
      appData,
    });

    const response: ProduceResponse = {
      peerId,
      producerId: result.producerId,
      kind: result.kind,
      paused: false,
      createdAt: Date.now(),
    };

    console.log(`✅ Producer created: ${result.producerId} (${kind})`);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Failed to produce:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to produce media',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/calls/produce/:producerId/pause
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
      producerId: string;
      paused: boolean;
    }

    const body = (await request.json()) as PauseRequest;
    const { peerId, producerId, paused } = body;

    if (user.id !== peerId) {
      return NextResponse.json(
        { error: 'Peer ID does not match authenticated user' },
        { status: 403 }
      );
    }

    const sfu = getMediasoupSFU();

    if (paused) {
      await sfu.pauseProducer(peerId, producerId);
    } else {
      await sfu.resumeProducer(peerId, producerId);
    }

    return NextResponse.json(
      {
        success: true,
        producerId,
        paused,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to pause/resume:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to pause/resume',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/calls/produce/:producerId
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
      producerId: string;
    }

    const body = (await request.json()) as DeleteRequest;
    const { peerId, producerId } = body;

    if (user.id !== peerId) {
      return NextResponse.json(
        { error: 'Peer ID does not match authenticated user' },
        { status: 403 }
      );
    }

    const sfu = getMediasoupSFU();
    await sfu.closeProducer(peerId, producerId);

    return NextResponse.json(
      {
        success: true,
        message: 'Producer closed',
        producerId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to close producer:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to close producer',
      },
      { status: 500 }
    );
  }
}
