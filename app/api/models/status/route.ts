/**
 * Model Status API Endpoint
 * Returns current model health, metrics, and performance data
 */

import { requireAuth } from '@/lib/auth';
import {
  getActiveModel,
  getModelConfig,
  getActiveModelMetrics,
  getModelSwitchHistory,
} from '@/lib/model-switching';
import { sql } from '@vercel/postgres';

export async function GET(request: Request) {
  try {
    // Verify authentication
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as 'stt' | 'translation' | 'tts' | null;

    if (type && !['stt', 'translation', 'tts'].includes(type)) {
      return Response.json(
        { error: 'Invalid type. Must be stt, translation, or tts' },
        { status: 400 }
      );
    }

    if (type) {
      // Get status for specific model type
      const config = await getModelConfig(type);
      const metrics = await sql`
        SELECT
          model_type,
          model_name,
          latency_ms,
          latency_p95,
          latency_p99,
          error_rate,
          success_rate,
          quality_score,
          cost_per_unit,
          total_cost_today,
          requests_total,
          requests_last_hour,
          requests_last_minute,
          measured_at
        FROM model_metrics
        WHERE model_type = $1
        ORDER BY measured_at DESC
        LIMIT 1
      `;

      const history = await getModelSwitchHistory(type, 5);

      return Response.json({
        success: true,
        type,
        config,
        metrics: metrics.rows[0] || null,
        history,
      });
    }

    // Get status for all model types
    const sttConfig = await getModelConfig('stt');
    const translationConfig = await getModelConfig('translation');
    const ttsConfig = await getModelConfig('tts');

    const allMetrics = await sql`
      SELECT
        model_type,
        model_name,
        latency_ms,
        latency_p95,
        latency_p99,
        error_rate,
        success_rate,
        quality_score,
        cost_per_unit,
        total_cost_today,
        requests_total,
        requests_last_hour,
        requests_last_minute,
        measured_at
      FROM model_metrics
      WHERE model_type IN ('stt', 'translation', 'tts')
      ORDER BY model_type, measured_at DESC
    `;

    const sttMetrics = allMetrics.rows.filter((m: any) => m.model_type === 'stt')[0];
    const translationMetrics = allMetrics.rows.filter((m: any) => m.model_type === 'translation')[0];
    const ttsMetrics = allMetrics.rows.filter((m: any) => m.model_type === 'tts')[0];

    // Get recent benchmarks
    const recentBenchmarks = await sql`
      SELECT
        model_type,
        current_model,
        new_model,
        improvement,
        should_switch,
        confidence,
        recommended_at
      FROM model_benchmarks
      ORDER BY recommended_at DESC
      LIMIT 10
    `;

    // Get fallback events
    const fallbackEvents = await sql`
      SELECT
        primary_model,
        fallback_model,
        reason,
        fallback_time,
        restored_at
      FROM model_fallback_log
      WHERE restored_at IS NULL
      ORDER BY fallback_time DESC
      LIMIT 5
    `;

    return Response.json({
      success: true,
      models: {
        stt: {
          config: sttConfig,
          metrics: sttMetrics,
        },
        translation: {
          config: translationConfig,
          metrics: translationMetrics,
        },
        tts: {
          config: ttsConfig,
          metrics: ttsMetrics,
        },
      },
      recentBenchmarks: recentBenchmarks.rows,
      activeFallbacks: fallbackEvents.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Status endpoint error:', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Status check failed',
      },
      { status: 500 }
    );
  }
}
