/**
 * Call Metrics WebSocket API
 * WebSocket /api/calls/metrics
 * Streams real-time call metrics: latency, jitter, packet loss, audio/video quality
 * Phase 13.3: Real-time metrics streaming via WebSocket
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getCallRegistry } from '@/lib/call-state-machine';

export interface MetricsUpdate {
  callId: string;
  timestamp: number;
  metrics: {
    latencyMs: number; // Round-trip latency
    jitterMs: number; // Latency variance
    packetLossPercent: number; // 0-100
    audioQualityScore: number; // 0-5 (MOS: Mean Opinion Score)
    videoQualityScore?: number; // 0-5
    bandwidth: number; // kbps
    cpuUsage?: number; // 0-100 percent
    memoryUsage?: number; // MB
  };
}

/**
 * POST /api/calls/metrics
 * Receive metrics update from client
 * This is used when the WebSocket upgrade path is not available
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
    const body = (await request.json()) as MetricsUpdate;
    const { callId, metrics } = body;

    if (!callId || !metrics) {
      return NextResponse.json(
        { error: 'Missing required fields: callId, metrics' },
        { status: 400 }
      );
    }

    // Fetch call from registry and update metrics
    const registry = getCallRegistry();
    const callMachine = registry.getCall(callId);

    if (!callMachine) {
      return NextResponse.json(
        { error: 'Call not found' },
        { status: 404 }
      );
    }

    // Update metrics in call context
    callMachine.updateMetrics(metrics);

    console.log(
      `📊 Metrics updated for call ${callId}: latency=${metrics.latencyMs}ms, loss=${metrics.packetLossPercent}%, quality=${metrics.audioQualityScore.toFixed(1)}`
    );

    // Return acknowledgment
    return NextResponse.json(
      {
        success: true,
        callId,
        receivedAt: Date.now(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to process metrics:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process metrics',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/calls/metrics
 * Get current metrics for a call (polling fallback)
 * Usage: GET /api/calls/metrics?callId=call_123
 */
export async function GET(request: NextRequest) {
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

    // Get callId from query params
    const { searchParams } = new URL(request.url);
    const callId = searchParams.get('callId');

    if (!callId) {
      return NextResponse.json(
        { error: 'Missing callId parameter' },
        { status: 400 }
      );
    }

    // Fetch call from registry
    const registry = getCallRegistry();
    const callMachine = registry.getCall(callId);

    if (!callMachine) {
      return NextResponse.json(
        { error: 'Call not found' },
        { status: 404 }
      );
    }

    const callContext = callMachine.getContext();

    // Return current metrics
    return NextResponse.json(
      {
        callId,
        state: callMachine.getState(),
        metrics: callContext.metrics || {
          latencyMs: 0,
          jitterMs: 0,
          packetLossPercent: 0,
          audioQualityScore: 0,
          bandwidth: 0,
        },
        duration: callMachine.getDuration(),
        timestamp: Date.now(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to get metrics:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get metrics',
      },
      { status: 500 }
    );
  }
}

/**
 * WebSocket Connection Handler
 * Streams metrics updates at 1-second intervals
 * Note: WebSocket support in Next.js requires custom server or middleware
 * For now, clients should use polling (GET) or POST updates
 *
 * Future enhancement: Implement WebSocket via custom server or Vercel Functions
 * See: https://nextjs.org/docs/app/building-your-application/routing/route-handlers#websockets
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
