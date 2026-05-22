/**
 * POST /api/voice-messages/send
 *
 * Send a voice message to another platform user.
 * Accepts base64-encoded WebM/Opus audio (up to 60s).
 * Attempts Whisper transcription if OPENAI_API_KEY is set.
 * Stores message in messages table (channel='voice_message').
 *
 * Body: {
 *   receiverUserId: string,
 *   audioBase64: string,      — base64-encoded WebM audio blob (no prefix)
 *   mimeType?: string,        — default 'audio/webm;codecs=opus'
 *   durationSeconds?: number,
 *   language?: string,        — sender's language code
 *   targetLanguage?: string,  — receiver's language for translation
 * }
 *
 * Returns: { ok, message: { id, content, translatedContent, mediaUrl, durationSeconds, createdAt } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const MAX_BASE64_BYTES = 512 * 1024; // 512KB base64 ~= ~375KB binary ~= ~3 min Opus audio

/** Transcribe audio using OpenAI Whisper if API key available. */
async function tryTranscribeWhisper(
  audioBase64: string,
  mimeType: string,
  language: string,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_WHISPER_API_KEY;
  if (!apiKey) return null;

  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Create FormData with the audio file
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, `voice.${mimeType.includes('webm') ? 'webm' : 'mp3'}`);
    formData.append('model', 'whisper-1');
    if (language && language !== 'auto') {
      formData.append('language', language.slice(0, 2));
    }

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) return null;
    const data = await res.json();
    return (data.text as string)?.trim() || null;
  } catch {
    return null;
  }
}

/** Translate transcription using DeepL if API key available. */
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
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
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
    const receiverUserId  = String(body.receiverUserId ?? '').trim();
    const audioBase64     = String(body.audioBase64 ?? '');
    const mimeType        = String(body.mimeType ?? 'audio/webm;codecs=opus');
    const durationSeconds = Math.min(60, Math.max(0, Number(body.durationSeconds ?? 0)));
    const language        = String(body.language ?? user.language ?? 'en').slice(0, 5);
    const targetLanguage  = String(body.targetLanguage ?? 'en').slice(0, 5);

    if (!receiverUserId) return NextResponse.json({ error: 'receiverUserId is required' }, { status: 400 });
    if (!audioBase64)    return NextResponse.json({ error: 'audioBase64 is required' }, { status: 400 });
    if (audioBase64.length > MAX_BASE64_BYTES) {
      return NextResponse.json({ error: 'Voice message too long (max ~3 minutes)' }, { status: 413 });
    }
    if (receiverUserId === user.id) {
      return NextResponse.json({ error: 'Cannot send to yourself' }, { status: 400 });
    }

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

    // Build data URL for storage (serves as both media_url and allows direct playback)
    const dataUrl = `data:${mimeType};base64,${audioBase64}`;

    // Attempt transcription
    const transcription = await tryTranscribeWhisper(audioBase64, mimeType, language);

    // Attempt translation of transcription
    let translatedContent: string | null = null;
    if (transcription) {
      translatedContent = await tryTranslate(transcription, language, effectiveTarget);
    }

    // Insert message
    const [msg] = await sql`
      INSERT INTO messages (
        sender_user_id, receiver_user_id, channel, direction,
        content, translated_content, language, target_language,
        media_url, media_type, media_size_bytes, status
      ) VALUES (
        ${user.id}::uuid, ${receiverUserId}::uuid, 'voice_message', 'outbound',
        ${transcription ?? null},
        ${translatedContent ?? transcription ?? null},
        ${language}, ${effectiveTarget},
        ${dataUrl}, ${mimeType}, ${Math.round(audioBase64.length * 0.75)},
        'delivered'
      )
      RETURNING id, content, translated_content, media_url, media_type, created_at
    `;

    // Notify receiver
    try {
      const senderName = user.name ?? 'Someone';
      const notifBody = transcription
        ? (transcription.length > 80 ? transcription.slice(0, 77) + '…' : transcription)
        : `Voice message (${durationSeconds}s)`;
      await sql`
        INSERT INTO user_notifications (user_id, type, title, body, metadata)
        VALUES (
          ${receiverUserId}::uuid, 'incoming_message',
          ${`Voice message from ${senderName}`},
          ${notifBody},
          ${JSON.stringify({ senderId: user.id, senderName, channel: 'voice_message', durationSeconds })}::jsonb
        )
      `;
    } catch { /* notifications are optional */ }

    return NextResponse.json({
      ok: true,
      message: {
        id:               msg.id,
        content:          msg.content,
        translatedContent:msg.translated_content,
        mediaUrl:         msg.media_url,
        durationSeconds,
        createdAt:        msg.created_at,
        transcribed:      !!transcription,
      },
    });
  } catch (err) {
    console.error('[voice-messages/send]', err);
    return NextResponse.json({ error: 'Failed to send voice message' }, { status: 500 });
  }
}
