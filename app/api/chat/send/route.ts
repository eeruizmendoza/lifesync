/**
 * POST /api/chat/send
 *
 * Send an in-app chat message to another platform user.
 * Stores the message in the messages table (channel='in_app_chat'),
 * then attempts auto-translation via DeepL if DEEPL_API_KEY is set.
 *
 * Body: {
 *   receiverUserId: string,   — UUID of recipient
 *   content: string,          — message text (max 4000 chars)
 *   language?: string,        — sender's language (default: user's preference or 'en')
 *   targetLanguage?: string,  — recipient's language for translation
 * }
 *
 * Returns: { ok, message: { id, content, translatedContent, createdAt, direction } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

/** Attempt to translate text using DeepL if API key is available. */
async function tryTranslate(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string | null> {
  if (!process.env.DEEPL_API_KEY) return null;
  if (sourceLang === targetLang) return null;
  try {
    const url = process.env.DEEPL_API_URL ?? 'https://api-free.deepl.com/v2/translate';
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text],
        source_lang: sourceLang.toUpperCase().slice(0, 2),
        target_lang: targetLang.toUpperCase().slice(0, 2),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.translations?.[0]?.text as string) ?? null;
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

    const body = await request.json().catch(() => ({}));
    const receiverUserId = String(body.receiverUserId ?? '').trim();
    const content        = String(body.content ?? '').trim();
    const language       = String(body.language ?? user.language ?? 'en').slice(0, 5);
    const targetLanguage = String(body.targetLanguage ?? 'en').slice(0, 5);

    if (!receiverUserId) return NextResponse.json({ error: 'receiverUserId is required' }, { status: 400 });
    if (!content)        return NextResponse.json({ error: 'content is required' }, { status: 400 });
    if (content.length > 4000) return NextResponse.json({ error: 'Message too long (max 4000 chars)' }, { status: 400 });
    if (receiverUserId === user.id) return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);

    // Verify receiver exists
    const [receiver] = await sql`
      SELECT id, language_preference FROM users
      WHERE id = ${receiverUserId}::uuid
        AND (private IS NULL OR private = false)
    `;
    if (!receiver) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });

    const effectiveTarget = targetLanguage !== 'en' ? targetLanguage
                          : (receiver.language_preference as string ?? 'en');

    // Translate
    const translatedContent = await tryTranslate(content, language, effectiveTarget);

    // Insert message
    const [msg] = await sql`
      INSERT INTO messages (
        sender_user_id, receiver_user_id, channel, direction,
        content, translated_content, language, target_language, status
      ) VALUES (
        ${user.id}::uuid, ${receiverUserId}::uuid, 'in_app_chat', 'outbound',
        ${content}, ${translatedContent ?? content}, ${language}, ${effectiveTarget}, 'delivered'
      )
      RETURNING id, content, translated_content, language, target_language, created_at
    `;

    // Create a notification for the receiver (if notifications table available)
    try {
      const senderName = user.name ?? 'Someone';
      await sql`
        INSERT INTO user_notifications (user_id, type, title, body, metadata)
        VALUES (
          ${receiverUserId}::uuid,
          'incoming_message',
          ${`New message from ${senderName}`},
          ${content.length > 80 ? content.slice(0, 77) + '…' : content},
          ${JSON.stringify({ senderId: user.id, senderName, channel: 'in_app_chat' })}::jsonb
        )
      `;
    } catch {
      // Notifications are optional — don't fail the send
    }

    return NextResponse.json({
      ok: true,
      message: {
        id:               msg.id,
        content:          msg.content,
        translatedContent:msg.translated_content,
        language:         msg.language,
        targetLanguage:   msg.target_language,
        direction:        'outbound',
        createdAt:        msg.created_at,
      },
    });
  } catch (err) {
    console.error('[chat/send]', err);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
