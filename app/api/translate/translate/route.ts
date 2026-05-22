import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditLogger } from '@/lib/audit-logger';
import { monitoringService } from '@/lib/monitoring-service';
import { getTranslationService } from '@/lib/translation-service';
import { getClientIP } from '@/lib/audit-logger';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

let user: any; // Will be set after requireAuth

/**
 * POST /api/translate/translate
 * Translate text from source language to target language with caching and monitoring
 *
 * Request body:
 * {
 *   text: string;
 *   sourceLang: string;
 *   targetLang: string;
 *   callId?: string;
 *   context?: { domain: string; formality: string };
 *   useCache?: boolean;
 *   useEnsemble?: boolean;
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIp = getClientIP(request.headers);

  try {
    // Require authentication
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { text, sourceLang, targetLang, callId, context, useCache = true, useEnsemble = true } = body;

    // Validate inputs
    if (!text || !sourceLang || !targetLang) {
      return NextResponse.json(
        { error: 'Missing required fields: text, sourceLang, targetLang' },
        { status: 400 }
      );
    }

    // Validate language codes
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(sourceLang) || !/^[a-z]{2}(-[A-Z]{2})?$/.test(targetLang)) {
      return NextResponse.json(
        { error: 'Invalid language code format' },
        { status: 400 }
      );
    }

    // Validate text length
    if (text.length > 5000) {
      return NextResponse.json(
        { error: 'Text too long (max 5000 characters)' },
        { status: 400 }
      );
    }

    // Check cache for recent translations
    let fromCache = false;
    let cachedResult: any = null;

    if (useCache) {
      const textHash = hashText(text);
      const cacheQuery = await db.query(
        `SELECT translated_text, provider, confidence FROM translation_cache
         WHERE source_text_hash = $1 AND source_language = $2 AND target_language = $3
         AND created_at > NOW() - INTERVAL '5 minutes'
         LIMIT 1`,
        [textHash, sourceLang, targetLang]
      );

      if (cacheQuery.rows.length > 0) {
        cachedResult = cacheQuery.rows[0];
        fromCache = true;
      }
    }

    // If cache hit, return immediately
    if (fromCache && cachedResult) {
      const processingTime = Date.now() - startTime;

      auditLogger.logDataAccess(
        user.id,
        'translation',
        crypto.randomUUID(),
        clientIp,
        { callId, fromCache: true, textLength: text.length }
      );

      monitoringService.recordRequestLatency('/api/translate/translate', processingTime);

      return NextResponse.json({
        translatedText: cachedResult.translated_text,
        sourceLang,
        targetLang,
        confidence: parseFloat(cachedResult.confidence),
        provider: cachedResult.provider,
        processingTimeMs: processingTime,
        fromCache: true,
      });
    }

    // Translate using service
    const translationService = getTranslationService();

    const result = useEnsemble
      ? await translationService.translateWithEnsemble(text, sourceLang, targetLang, context)
      : await translationService.translateWithProvider(text, sourceLang, targetLang, 'DeepL-v3', context);

    // Store in cache for future use
    if (callId) {
      const textHash = hashText(text);
      try {
        await db.query(
          `INSERT INTO translation_cache
           (source_text_hash, source_language, target_language, translated_text, provider, confidence, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (source_text_hash, source_language, target_language) DO UPDATE SET
           created_at = NOW(), confidence = EXCLUDED.confidence`,
          [
            textHash,
            sourceLang,
            targetLang,
            result.text,
            result.provider,
            result.confidence,
          ]
        );
      } catch (cacheError) {
        console.warn('Failed to cache translation:', cacheError);
        // Continue even if cache fails
      }
    }

    // Record metrics
    monitoringService.recordRequestLatency('/api/translate/translate', result.processingTimeMs);
    monitoringService.recordMetric('translation_quality', result.confidence, {
      sourceLang,
      targetLang,
      provider: result.provider,
    });

    // Audit log
    auditLogger.logDataAccess(
      user.id,
      'translation',
      crypto.randomUUID(),
      clientIp,
      {
        callId,
        sourceLang,
        targetLang,
        textLength: text.length,
        provider: result.provider,
        useEnsemble,
        processingTimeMs: result.processingTimeMs,
      }
    );

    return NextResponse.json({
      translatedText: result.text,
      sourceLang: result.sourceLang,
      targetLang: result.targetLang,
      confidence: result.confidence,
      provider: result.provider,
      processingTimeMs: result.processingTimeMs,
      alternatives: result.alternatives,
      fromCache: false,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log error
    if (error instanceof Error) {
      auditLogger.logError(error, '/api/translate/translate', user?.id, clientIp);
      monitoringService.recordError(error.constructor.name, '/api/translate/translate');
    }

    console.error('Translation error:', error);

    // Return error response
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Translation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/translate/translate
 * Health check
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      status: 'ok',
      service: 'translation',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Service unavailable' },
      { status: 503 }
    );
  }
}

/**
 * Hash function for cache keys
 */
function hashText(text: string): string {
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(text)
    .digest('hex')
    .substring(0, 64);
}
