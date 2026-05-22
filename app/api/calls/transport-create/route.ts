/**
 * Create WebRTC Transport API
 * POST /api/calls/transport-create
 * Creates a WebRTC transport for a peer
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getMediasoupSFU } from '@/lib/mediasoup-handler';

interface CreateTransportRequest {
  callId: string;
  peerId: string;
  forceTcp?: boolean; // Force TCP if UDP fails
}

interface CreateTransportResponse {
  callId: string;
  peerId: string;
  transportId: string;
  iceParameters: any;
  iceCandidates: any[];
  dtlsParameters: any;
  createdAt: number;
}

/**
 * POST /api/calls/transport-create
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
    const body = (await request.json()) as CreateTransportRequest;
    const { callId, peerId, forceTcp = false } = body;

    // Validate
    if (!callId || !peerId) {
      return NextResponse.json(
        { error: 'Missing required fields: callId, peerId' },
        { status: 400 }
      );
    }

    // Verify peer ID matches authenticated user
    if (user.id !== peerId) {
      return NextResponse.json(
        { error: 'Peer ID does not match authenticated user' },
        { status: 403 }
      );
    }

    // Get Mediasoup SFU
    const sfu = getMediasoupSFU();
    if (!sfu.isHealthy()) {
      return NextResponse.json(
        { error: 'Mediasoup service is not healthy' },
        { status: 503 }
      );
    }

    // Create transport
    const machineIp = process.env.MACHINE_IP || '127.0.0.1';
    const publicIp = process.env.MACHINE_PUBLIC_IP || machineIp;

    const transportConfig = {
      listenIps: [{ ip: machineIp, announcedIp: publicIp }],
      enableUdp: !forceTcp,
      enableTcp: true,
      preferUdp: !forceTcp,
    };

    const transportInfo = await sfu.createTransport(callId, peerId, transportConfig);

    const response: CreateTransportResponse = {
      callId,
      peerId,
      transportId: transportInfo.transportId,
      iceParameters: transportInfo.iceParameters,
      iceCandidates: transportInfo.iceCandidates,
      dtlsParameters: transportInfo.dtlsParameters,
      createdAt: Date.now(),
    };

    console.log(`✅ Transport created: ${transportInfo.transportId}`);
    console.log(`   Peer: ${peerId}`);
    console.log(`   Call: ${callId}`);
    console.log(`   ICE candidates: ${transportInfo.iceCandidates.length}`);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Failed to create transport:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create transport',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/calls/transport-connect
 * Connect transport (complete DTLS handshake)
 */
export async function PUT(request: NextRequest) {
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
    interface ConnectTransportRequest {
      peerId: string;
      dtlsParameters: any;
    }
    const body = (await request.json()) as ConnectTransportRequest;
    const { peerId, dtlsParameters } = body;

    // Validate
    if (!peerId || !dtlsParameters) {
      return NextResponse.json(
        { error: 'Missing required fields: peerId, dtlsParameters' },
        { status: 400 }
      );
    }

    // Verify peer ID matches authenticated user
    if (user.id !== peerId) {
      return NextResponse.json(
        { error: 'Peer ID does not match authenticated user' },
        { status: 403 }
      );
    }

    // Get Mediasoup SFU
    const sfu = getMediasoupSFU();
    await sfu.connectTransport(peerId, dtlsParameters);

    console.log(`✅ Transport connected: ${peerId}`);

    return NextResponse.json(
      {
        success: true,
        message: 'Transport connected',
        peerId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to connect transport:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to connect transport',
      },
      { status: 500 }
    );
  }
}
