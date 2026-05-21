/**
 * Research Pipeline Trigger
 * Runs daily to check for model improvements and auto-switch
 * 
 * POST /api/research-pipeline/run
 * 
 * Used by:
 * - Scheduled Vercel cron jobs (daily at 2 AM UTC)
 * - Manual trigger from admin dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { runResearchPipeline } from '@/scripts/research-pipeline';

export async function POST(request: NextRequest) {
  try {
    // Verify authorization (admin only or cron secret)
    const cronSecret = request.headers.get('x-cron-secret');

    // Allow if:
    // 1. Authorized user making manual request
    // 2. Valid cron secret (for automated runs)
    if (!cronSecret || cronSecret !== process.env.RESEARCH_PIPELINE_CRON_SECRET) {
      try {
        await requireAuth();
      } catch {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    console.log('🔬 Research pipeline triggered');
    const result = await runResearchPipeline();

    return NextResponse.json({
      success: true,
      timestamp: result.timestamp,
      newVersionsFound: result.newVersionsFound,
      benchmarksRun: result.benchmarksRun,
      switchesMade: result.switchesMade,
      improvements: result.improvements,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Research pipeline error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Status endpoint - check if pipeline can run
    const cronSecret = request.headers.get('x-cron-secret');

    if (!cronSecret || cronSecret !== process.env.RESEARCH_PIPELINE_CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      status: 'ready',
      nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      message: 'Research pipeline is ready to run',
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
