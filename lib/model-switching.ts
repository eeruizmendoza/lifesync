/**
 * Model Switching Service
 * Manages active AI model selection and fallback behavior
 *
 * Architecture:
 * - Primary: Latest/best model (after benchmarking)
 * - Secondary: Fallback if primary fails
 * - Tertiary: Always available fallback
 */

import { sql } from '@vercel/postgres';

export interface ModelConfig {
  type: 'stt' | 'translation' | 'tts';
  activeModel: string;
  previousModel: string;
  fallbackModel: string;
  lastSwitchedAt: Date;
  improvementPercent: number;
  enabled: boolean;
}

export interface ModelStatus {
  model: string;
  isHealthy: boolean;
  lastCheckedAt: Date;
  errorRate: number; // 0-1
  latencyMs: number;
  costPerUnit: number;
}

/**
 * Get current active configuration for a model type
 */
export async function getModelConfig(type: 'stt' | 'translation' | 'tts'): Promise<ModelConfig | null> {
  try {
    const result = await sql`
      SELECT
        model_type,
        active_model,
        previous_model,
        fallback_model,
        last_switched_at,
        improvement_percent,
        enabled
      FROM model_config
      WHERE model_type = $1
      LIMIT 1
    `;

    if (!result.rows.length) {
      return null;
    }

    const row = result.rows[0];
    return {
      type: row.model_type,
      activeModel: row.active_model,
      previousModel: row.previous_model,
      fallbackModel: row.fallback_model,
      lastSwitchedAt: row.last_switched_at,
      improvementPercent: row.improvement_percent,
      enabled: row.enabled,
    };
  } catch (error) {
    console.error('Failed to get model config:', error);
    return null;
  }
}

/**
 * Get model to use, with fallback chain
 * If primary fails, tries secondary, then tertiary
 */
export async function getActiveModel(
  type: 'stt' | 'translation' | 'tts'
): Promise<string> {
  const config = await getModelConfig(type);

  if (!config) {
    // Default fallback if config not found
    const defaults: Record<string, string> = {
      stt: 'whisper-v3',
      translation: 'deepl-v3',
      tts: 'elevenlabs-v3',
    };
    return defaults[type] || 'unknown';
  }

  // Check if active model is healthy
  const status = await checkModelHealth(config.activeModel);

  if (status.isHealthy && config.enabled) {
    return config.activeModel;
  }

  console.warn(`Primary model ${config.activeModel} is unhealthy, using fallback ${config.fallbackModel}`);

  // Log fallback usage
  await logModelFallback(config.activeModel, config.fallbackModel);

  return config.fallbackModel;
}

/**
 * Check if a model is responding and healthy
 */
export async function checkModelHealth(modelName: string): Promise<ModelStatus> {
  const startTime = Date.now();

  try {
    let isHealthy = false;

    // Provider-specific health checks
    if (modelName.includes('whisper')) {
      isHealthy = await checkOpenAIHealth();
    } else if (modelName.includes('deepl')) {
      isHealthy = await checkDeepLHealth();
    } else if (modelName.includes('elevenlabs')) {
      isHealthy = await checkElevenLabsHealth();
    } else if (modelName.includes('seamless')) {
      isHealthy = await checkMetaHealth();
    } else if (modelName.includes('deepgram')) {
      isHealthy = await checkDeepgramHealth();
    } else {
      // Default to healthy if unknown
      isHealthy = true;
    }

    const latencyMs = Date.now() - startTime;

    return {
      model: modelName,
      isHealthy,
      lastCheckedAt: new Date(),
      errorRate: isHealthy ? 0 : 1.0,
      latencyMs,
      costPerUnit: 0.01,
    };
  } catch (error) {
    console.error(`Health check failed for ${modelName}:`, error);
    const latencyMs = Date.now() - startTime;

    return {
      model: modelName,
      isHealthy: false,
      lastCheckedAt: new Date(),
      errorRate: 1.0,
      latencyMs,
      costPerUnit: 0,
    };
  }
}

/**
 * Check OpenAI API health
 */
async function checkOpenAIHealth(): Promise<boolean> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_WHISPER_API_KEY}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check DeepL API health
 */
async function checkDeepLHealth(): Promise<boolean> {
  try {
    const response = await fetch('https://api.deepl.com/v2/languages', {
      headers: {
        'Authorization': `DeepAuthKey ${process.env.DEEPL_API_KEY}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check ElevenLabs API health
 */
async function checkElevenLabsHealth(): Promise<boolean> {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/models', {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check Meta Seamless availability
 */
async function checkMetaHealth(): Promise<boolean> {
  try {
    // For self-hosted Seamless, check local endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('http://localhost:8080/health', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    // Seamless is self-hosted, so assume healthy if we can reach it locally
    return false;
  }
}

/**
 * Check Deepgram API health
 */
async function checkDeepgramHealth(): Promise<boolean> {
  try {
    const response = await fetch('https://api.deepgram.com/v1/status', {
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Log when system falls back to secondary model
 * Used for monitoring and alerting
 */
export async function logModelFallback(
  primaryModel: string,
  fallbackModel: string
): Promise<void> {
  try {
    await sql`
      INSERT INTO model_fallback_log (
        primary_model,
        fallback_model,
        fallback_time
      )
      VALUES ($1, $2, NOW())
    `;

    console.log(`Logged fallback: ${primaryModel} → ${fallbackModel}`);
  } catch (error) {
    console.error('Failed to log fallback:', error);
  }
}

/**
 * Switch to a new model (manual override)
 * Use when you want to test a new model
 */
export async function switchModel(
  type: 'stt' | 'translation' | 'tts',
  newModel: string,
  reason: string
): Promise<boolean> {
  try {
    const current = await getModelConfig(type);
    if (!current) {
      console.error(`No config found for ${type}`);
      return false;
    }

    // Update config
    await sql`
      UPDATE model_config
      SET
        previous_model = active_model,
        active_model = $1,
        last_switched_at = NOW()
      WHERE model_type = $2
    `;

    // Log switch
    await sql`
      INSERT INTO model_switch_log (
        model_type,
        from_model,
        to_model,
        reason,
        switched_at
      )
      VALUES ($1, $2, $3, $4, NOW())
    `;

    console.log(`🔄 Switched ${type}: ${current.activeModel} → ${newModel} (${reason})`);
    return true;
  } catch (error) {
    console.error('Failed to switch model:', error);
    return false;
  }
}

/**
 * Rollback to previous model (emergency recovery)
 * Use if new model is causing issues
 */
export async function rollbackModel(type: 'stt' | 'translation' | 'tts'): Promise<boolean> {
  try {
    const current = await getModelConfig(type);
    if (!current) {
      return false;
    }

    // Swap active and previous
    await sql`
      UPDATE model_config
      SET
        active_model = previous_model,
        previous_model = active_model,
        last_switched_at = NOW()
      WHERE model_type = $1
    `;

    // Log rollback
    await sql`
      INSERT INTO model_switch_log (
        model_type,
        from_model,
        to_model,
        reason,
        switched_at
      )
      VALUES ($1, $2, $3, 'Emergency rollback', NOW())
    `;

    console.log(`🔙 Rolled back ${type}: ${current.activeModel} → ${current.previousModel}`);
    return true;
  } catch (error) {
    console.error('Failed to rollback model:', error);
    return false;
  }
}

/**
 * Get model history (last 10 switches)
 * Used for auditing
 */
export async function getModelSwitchHistory(
  type: 'stt' | 'translation' | 'tts',
  limit: number = 10
): Promise<
  Array<{
    fromModel: string;
    toModel: string;
    reason: string;
    switchedAt: Date;
    improvementPercent?: number;
  }>
> {
  try {
    const result = await sql`
      SELECT
        from_model,
        to_model,
        reason,
        switched_at,
        improvement_percent
      FROM model_switch_log
      WHERE model_type = $1
      ORDER BY switched_at DESC
      LIMIT $2
    `;

    return result.rows.map(row => ({
      fromModel: row.from_model,
      toModel: row.to_model,
      reason: row.reason,
      switchedAt: row.switched_at,
      improvementPercent: row.improvement_percent,
    }));
  } catch (error) {
    console.error('Failed to get model history:', error);
    return [];
  }
}

/**
 * Get cost comparison between models
 * Helps identify cost-effective upgrades
 */
export async function getModelCostComparison(
  type: 'stt' | 'translation' | 'tts'
): Promise<
  Array<{
    model: string;
    costPerUnit: number;
    qualityScore: number;
    costEfficiency: number; // quality / cost
  }>
> {
  try {
    // TODO: Query model_costs table for comparison
    // For now, return empty array

    return [];
  } catch (error) {
    console.error('Failed to get cost comparison:', error);
    return [];
  }
}

/**
 * Disable a model (quarantine due to issues)
 */
export async function disableModel(type: 'stt' | 'translation' | 'tts'): Promise<boolean> {
  try {
    await sql`
      UPDATE model_config
      SET enabled = false
      WHERE model_type = $1
    `;

    console.log(`❌ Disabled ${type} model`);
    return true;
  } catch (error) {
    console.error('Failed to disable model:', error);
    return false;
  }
}

/**
 * Re-enable a model
 */
export async function enableModel(type: 'stt' | 'translation' | 'tts'): Promise<boolean> {
  try {
    await sql`
      UPDATE model_config
      SET enabled = true
      WHERE model_type = $1
    `;

    console.log(`✅ Enabled ${type} model`);
    return true;
  } catch (error) {
    console.error('Failed to enable model:', error);
    return false;
  }
}

/**
 * Get metrics for current active models
 * Shows performance of live system
 */
export async function getActiveModelMetrics(): Promise<{
  stt: ModelStatus;
  translation: ModelStatus;
  tts: ModelStatus;
}> {
  const sttConfig = await getModelConfig('stt');
  const translationConfig = await getModelConfig('translation');
  const ttsConfig = await getModelConfig('tts');

  const [sttStatus, translationStatus, ttsStatus] = await Promise.all([
    checkModelHealth(sttConfig?.activeModel || 'unknown'),
    checkModelHealth(translationConfig?.activeModel || 'unknown'),
    checkModelHealth(ttsConfig?.activeModel || 'unknown'),
  ]);

  return {
    stt: sttStatus,
    translation: translationStatus,
    tts: ttsStatus,
  };
}
