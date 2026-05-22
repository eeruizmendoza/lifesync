/**
 * POST /api/room/translate
 *
 * Translate text from one language to another.
 * Used by Room Mode for real-time translation between seats.
 * Falls back to returning original text if no API key configured.
 *
 * Body: {
 *   text: string,
 *   sourceLang: string,   — 2-letter ISO (e.g. 'en', 'es')
 *   targetLang: string,
 * }
 *
 * Returns: { ok, translatedText, provider: 'deepl' | 'none' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const text       = String(body.text ?? '').trim();
    const sourceLang = String(body.sourceLang ?? 'en').slice(0, 5).toUpperCase();
    const targetLang = String(body.targetLang ?? 'en').slice(0, 5).toUpperCase();

    if (!text) return NextResponse.json({ ok: true, translatedText: '', provider: 'none' });

    // Same language — no translation needed
    if (sourceLang.slice(0, 2) === targetLang.slice(0, 2)) {
      return NextResponse.json({ ok: true, translatedText: text, provider: 'none' });
    }

    // DeepL
    if (process.env.DEEPL_API_KEY) {
      try {
        const url = process.env.DEEPL_API_URL ?? 'https://api-free.deepl.com/v2/translate';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text:        [text],
            source_lang: sourceLang.slice(0, 2),
            target_lang: targetLang.slice(0, 2),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const translated = (data.translations?.[0]?.text as string)?.trim();
          if (translated) {
            return NextResponse.json({ ok: true, translatedText: translated, provider: 'deepl' });
          }
        }
      } catch { /* fall through */ }
    }

    // No translation key — return original
    return NextResponse.json({ ok: true, translatedText: text, provider: 'none' });
  } catch (err) {
    console.error('[room/translate]', err);
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
