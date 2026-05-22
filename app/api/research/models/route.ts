/**
 * Research Pipeline API
 * GET /api/research/models - Get current models and benchmark history
 * POST /api/research/models - Trigger manual research pipeline run
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getResearchPipeline } from '@/lib/research-pipeline';
import { runDailyResearchPipeline } from '@/lib/research-pipeline-scheduler';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication (admin only)
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuth(authHeader);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const pipeline = getResearchPipeline();
    const status = pipeline.getStatus();
    const history = pipeline.getHistory();

    // Group history by model type
    const historyByType = {
      transcription: history.filter((h) => ['deepgram', 'whisper', 'seamless-m4t'].includes(h.provider)),
      translation: history.filter((h) => ['deepl', 'google', 'argos'].includes(h.provider)),
      tts: history.filter((h) => ['elevenlabs', 'piper', 'google'].includes(h.provider)),
    };

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        status,
        history: {
          total: history.length,
          byType: historyByType,
          recent: history.slice(-10).reverse(), // Last 10, most recent first
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to get research pipeline status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication (admin only)
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuth(authHeader);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'run') {
      // Trigger manual run
      const result = await runDailyResearchPipeline();

      return NextResponse.json(
        {
          timestamp: new Date().toISOString(),
          action: 'triggered',
          result,
        },
        { status: 200 }
      );
    } else if (action === 'status') {
      // Get current status
      const pipeline = getResearchPipeline();
      const status = pipeline.getStatus();

      return NextResponse.json(
        {
          timestamp: new Date().toISOString(),
          status,
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Research pipeline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
