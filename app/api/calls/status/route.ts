/**
 * Call Status API
 * GET /api/calls/{callId}/status - Get current call status and metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const callId = searchParams.get('callId');

    if (!callId) {
      return NextResponse.json(
        { error: 'Missing callId parameter' },
        { status: 400 }
      );
    }

    // TODO: Get call status from database
    // For now, return mock status
    return NextResponse.json({
      success: true,
      callId,
      status: 'active', // 'ringing' | 'connected' | 'ended'
      participants: [
        {
          userId: 'user-1',
          language: 'es',
          name: 'User 1',
          isHost: true,
          audioEnabled: true,
          videoEnabled: false,
        },
        {
          userId: 'user-2',
          language: 'zh',
          name: 'User 2',
          isHost: false,
          audioEnabled: true,
          videoEnabled: false,
        },
      ],
      duration: 65000, // milliseconds
      startTime: Date.now() - 65000,
      metrics: {
        audioLatency: 85, // ms
        videoLatency: 120,
        packetLoss: 0.02, // 2%
        bandwidth: 512, // kbps
        audioQuality: 4.2, // 0-5 MOS
        videoQuality: 3.8,
      },
      recording: {
        isActive: true,
        duration: 65000,
      },
    });
  } catch (error) {
    console.error('Status endpoint error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Status check failed',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { callId, action } = body;

    if (!callId || !action) {
      return NextResponse.json(
        { error: 'Missing callId or action' },
        { status: 400 }
      );
    }

    // Handle various call actions
    switch (action) {
      case 'update-metrics':
        // Update call metrics
        return NextResponse.json({ success: true, message: 'Metrics updated' });

      case 'log-event':
        // Log call event
        const { event, data } = body;
        console.log(`Call event: ${event}`, data);
        return NextResponse.json({ success: true, message: 'Event logged' });

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Status endpoint error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Request failed',
      },
      { status: 500 }
    );
  }
}
