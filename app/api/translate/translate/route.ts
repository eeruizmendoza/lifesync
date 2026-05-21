import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { translateWithEnsemble, translateWithCache } from '@/lib/translation-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/translate/translate
 * Translate text from source language to target language
 *
 * Request body:
 * {
 *   text: string;
 *   sourceLang: string;
 *   targetLang: string;
 *   context?: { domain: string; formality: string };
 *   useCache?: boolean;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { text, sourceLang, targetLang, context, useCache = true } = body;

    // Validate inputs
    if (!text || !sourceLang || !targetLang) {
      return NextResponse.json(
        { error: 'Missing required fields: text, sourceLang, targetLang' },
        { status: 400 }
      );
    }

    // Use cache if requested
    if (useCache) {
      const cachedResult = await translateWithCache(text, sourceLang, targetLang);
      if (cachedResult) {
        return NextResponse.json({
          success: true,
          translatedText: cachedResult,
          sourceLang,
          targetLang,
          isCached: true,
        });
      }
    }

    // Translate with ensemble voting
    const result = await translateWithEnsemble(text, sourceLang, targetLang, context);

    return NextResponse.json({
      success: true,
      translatedText: result.translatedText,
      sourceLang,
      targetLang,
      confidence: result.confidence,
      provider: result.provider,
      isCached: false,
    });
  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: 'Translation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/translate/translate
 * Get translation status or health check
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
