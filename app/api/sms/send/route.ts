/**
 * POST /api/sms/send
 * Phase 55 — Send a translated SMS to a contact's phone number.
 *
 * Body:
 * {
 *   to:              string   — destination phone number (E.164 or 10-digit)
 *   content:         string   — message text
 *   contactUserId?:  string   — LifeSync user ID of recipient (for timeline)
 *   language?:       string   — sender's language code (default: 'en')
 *   targetLanguage?: string   — recipient's language (will translate if set and different)
 * }
 *
 * Response:
 * {
 *   ok:             boolean
 *   messageId:      string   — DB row id
 *   twilioSid?:     string
 *   translated?:    boolean  — whether translation was applied
 *   sentContent:    string   — the text actually sent (may be translated)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';
import { sendSMS, hasTwilio } from '@/lib/twilio-sms';

export const dynamic = 'force-dynamic';

async function tryTranslate(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string | null> {
  if (!process.env.DEEPL_API_KEY) return null;
  if (sourceLang === targetLang) return null;

  try {
    const res = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        text,
        source_lang: sourceLang.toUpperCase(),
        target_lang: targetLang.toUpperCase(),
      }).toString(),
      signal: AbortSignal.timeout(5_000),
    });
    const data = await res.json() as { translations?: { text: string }[] };
    return data?.translations?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const {
      to,
      content,
      contactUserId,
      language = 'en',
      targetLanguage = 'en',
    } = body as {
      to: string;
      content: string;
      contactUserId?: string;
      language?: string;
      targetLanguage?: string;
    };

    if (!to || !content?.trim()) {
      return NextResponse.json({ error: 'Missing required fields: to, content' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Try to translate content into recipient's language
    const translated = await tryTranslate(content, language, targetLanguage);
    const sentContent = translated ?? content;

    // Send via Twilio (or simulate if not configured)
    let twilioSid: string | undefined;
    if (hasTwilio()) {
      const result = await sendSMS(to, sentContent);
      if (!result.ok) {
        return NextResponse.json({
          error: result.error ?? 'Failed to send SMS',
        }, { status: 502 });
      }
      twilioSid = result.sid;
    }

    // Store in universal messages table
    const msgRows = await sql`
      INSERT INTO messages (
        sender_user_id,
        receiver_user_id,
        org_id,
        channel,
        direction,
        status,
        content,
        translated_content,
        language,
        target_language,
        external_message_id
      ) VALUES (
        ${user.id}::uuid,
        ${contactUserId ?? null},
        ${user.orgId ?? null},
        'sms',
        'outbound',
        'sent',
        ${content},
        ${translated},
        ${language},
        ${targetLanguage},
        ${twilioSid ?? null}
      )
      RETURNING id
    `.catch(() => []);

    const messageId = (msgRows as any[])[0]?.id ? String((msgRows as any[])[0].id) : null;

    return NextResponse.json({
      ok: true,
      messageId,
      twilioSid,
      translated: !!translated,
      sentContent,
    });

  } catch (err) {
    console.error('[sms/send]', err);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
  }
}
