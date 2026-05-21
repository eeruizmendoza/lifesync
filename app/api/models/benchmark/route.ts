/**
 * Benchmark Models API Endpoint
 * Allows manual triggering of model benchmarking and comparison
 */

import { requireAuth } from '@/lib/auth';
import {
  benchmarkAllModelsInCategory,
  compareSpeechModels,
} from '@/lib/model-benchmarking';
import { getModelConfig } from '@/lib/model-switching';
import { sql } from '@vercel/postgres';

export async function GET(request: Request) {
  try {
    // Verify authentication (admin only)
    const user = await requireAuth(request, { adminOnly: true });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as 'stt' | 'translation' | 'tts' | null;
    const action = searchParams.get('action'); // 'status' or 'benchmark'

    if (action === 'status') {
      // Get current benchmark status
      const result = await sql`
        SELECT
          model_type,
          current_model,
          current_score,
          new_model,
          new_score,
          improvement,
          should_switch,
          confidence,
          recommended_at
        FROM model_benchmarks
        ORDER BY recommended_at DESC
        LIMIT 10
      `;

      return Response.json({
        success: true,
        benchmarks: result.rows,
      });
    }

    if (!type || !['stt', 'translation', 'tts'].includes(type)) {
      return Response.json(
        { error: 'Invalid model type. Must be stt, translation, or tts' },
        { status: 400 }
      );
    }

    if (action === 'benchmark') {
      // Manually trigger benchmarking for a category
      const results = await benchmarkAllModelsInCategory(type);

      return Response.json({
        success: true,
        type,
        benchmarksRun: results.length,
        results,
      });
    }

    return Response.json(
      { error: 'Invalid action. Use action=status or action=benchmark' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Benchmark endpoint error:', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Benchmark failed',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Verify authentication (admin only)
    const user = await requireAuth(request, { adminOnly: true });

    const body = await request.json();
    const { type, currentModel, newModel, language } = body;

    if (!type || !currentModel || !newModel) {
      return Response.json(
        {
          error:
            'Missing required fields: type, currentModel, newModel',
        },
        { status: 400 }
      );
    }

    // Run comparison
    const result = await compareSpeechModels(
      type,
      currentModel,
      newModel,
      language || 'en'
    );

    // Save to database
    await sql`
      INSERT INTO model_benchmarks (
        model_type,
        current_model,
        current_score,
        new_model,
        new_score,
        improvement,
        should_switch,
        confidence,
        recommended_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW()
      )
    `;

    return Response.json({
      success: true,
      result,
      message: result.shouldSwitch
        ? `Switch recommended: ${currentModel} → ${newModel} (+${(result.improvement * 100).toFixed(1)}%)`
        : 'No improvement threshold met',
    });
  } catch (error) {
    console.error('Comparison endpoint error:', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Comparison failed',
      },
      { status: 500 }
    );
  }
}
