/**
 * POST /api/sms/receive
 * Phase 55 — Twilio webhook for incoming SMS messages.
 *
 * Twilio calls this endpoint when a message arrives at the LifeSync
 * phone number. We:
 *   1. Validate the Twilio signature (HMAC-SHA1)
 *   2. Match sender phone to a LifeSync user
 *   3. Translate message to the receiving user's language
 *   4. Store in universal messages table (channel='sms', direction='inbound')
 *   5. Create a user_notification for the recipient
 *   6. Return a TwiML <Response/> (empty = no reply by default)
 *
 * Twilio sends this as application/x-www-form-urlencoded with fields:
 *   MessageSid, From, To, Body, NumMedia, etc.
 *
 * Configure in Twilio Console:
 *   Voice → Phone Numbers → [your number] → Messaging → Webhook
 *   URL: https://lifesync.app/api/sms/receive
 *   HTTP Method: POST
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { validateTwilioSignature, normalizePhone } from '@/lib/twilio-sms';

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

// Returns empty TwiML — no automatic reply
function emptyTwiML(): NextResponse {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Parse form-encoded Twilio payload
    const text = await request.text();
    const params: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(text)) {
      params[k] = v;
    }

    // Validate Twilio signature
    const signature = request.headers.get('x-twilio-signature') ?? '';
    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://lifesync.app'}/api/sms/receive`;
    const valid = await validateTwilioSignature(signature, url, params);
    if (!valid) {
      return new NextResponse('Unauthorized', { status: 403 });
    }

    const from = params.From ?? '';
    const body = (params.Body ?? '').trim();
    const twilioSid = params.MessageSid ?? '';

    if (!from || !body) return emptyTwiML();

    const sql = neon(process.env.DATABASE_URL!);
    const normalizedFrom = normalizePhone(from);

    // Check for duplicate (Twilio may retry)
    if (twilioSid) {
      const dupe = await sql`
        SELECT id FROM messages
        WHERE external_message_id = ${twilioSid}
        LIMIT 1
      `.catch(() => []);
      if ((dupe as any[]).length > 0) return emptyTwiML();
    }

    // Find sender (by phone number) and receiver (our Twilio number → match to a LifeSync user)
    const senderRows = await sql`
      SELECT id, name, language_preference AS language
      FROM users
      WHERE phone_number = ${normalizedFrom}
        OR phone_number = ${from}
      LIMIT 1
    `.catch(() => []);

    const senderUserId = (senderRows as any[])[0]?.id ? String((senderRows as any[])[0].id) : null;
    const senderLanguage = (senderRows as any[])[0]?.language
      ? String((senderRows as any[])[0].language)
      : 'en';

    // The receiver is whichever LifeSync user owns the Twilio number.
    // For now, find the first admin user or fall back to senderRows' contact.
    // In multi-tenant setup, this would be routed by org.
    const recipientRows = await sql`
      SELECT u.id, u.language_preference AS language
      FROM users u
      WHERE u.id != ${senderUserId ?? '00000000-0000-0000-0000-000000000000'}::uuid
      ORDER BY u.created_at ASC
      LIMIT 1
    `.catch(() => []);

    const receiverUserId = (recipientRows as any[])[0]?.id
      ? String((recipientRows as any[])[0].id)
      : null;
    const receiverLanguage = (recipientRows as any[])[0]?.language
      ? String((recipientRows as any[])[0].language)
      : 'en';

    // Translate into receiver's language
    const translated = await tryTranslate(body, senderLanguage, receiverLanguage);

    // Store in messages table
    const msgRows = await sql`
      INSERT INTO messages (
        sender_user_id,
        receiver_user_id,
        channel,
        direction,
        status,
        content,
        translated_content,
        language,
        target_language,
        external_message_id
      ) VALUES (
        ${senderUserId},
        ${receiverUserId},
        'sms',
        'inbound',
        'delivered',
        ${body},
        ${translated},
        ${senderLanguage},
        ${receiverLanguage},
        ${twilioSid || null}
      )
      RETURNING id
    `.catch(() => []);

    const messageId = (msgRows as any[])[0]?.id ? String((msgRows as any[])[0].id) : null;

    // Create notification for the receiver
    if (receiverUserId) {
      const preview = body.length > 60 ? body.slice(0, 57) + '…' : body;
      const senderName = (senderRows as any[])[0]?.name
        ? String((senderRows as any[])[0].name)
        : normalizedFrom;

      await sql`
        INSERT INTO user_notifications (user_id, type, title, body, link)
        VALUES (
          ${receiverUserId}::uuid,
          'sms_received',
          ${'SMS from ' + senderName},
          ${preview},
          ${senderUserId ? '/contacts/' + senderUserId : '/contacts'}
        )
      `.catch(() => {});
    }

    console.log(`[sms/receive] ${normalizedFrom} → ${body.slice(0, 40)} (${messageId})`);

    return emptyTwiML();

  } catch (err) {
    console.error('[sms/receive]', err);
    // Always return valid TwiML to prevent Twilio retries
    return emptyTwiML();
  }
}
