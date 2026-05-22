/**
 * POST /api/room/save-session
 *
 * Save a completed Room Mode session as a message in the messages table.
 * Also optionally links to a contact for the contact timeline.
 *
 * Body: {
 *   durationSeconds: number,
 *   languages: string[],          — e.g. ['en', 'es']
 *   turnCount: number,
 *   transcript: { seat, lang, original, translated, timestamp }[],
 *   contactUserId?: string,       — if 1:1 session, link to contact timeline
 * }
 *
 * Returns: { ok, messageId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const durationSeconds = Math.max(0, Number(body.durationSeconds ?? 0));
    const languages       = Array.isArray(body.languages) ? body.languages.slice(0, 6) : ['en'];
    const turnCount       = Math.max(0, Number(body.turnCount ?? 0));
    const transcript      = Array.isArray(body.transcript) ? body.transcript.slice(0, 500) : [];
    const contactUserId   = body.contactUserId ? String(body.contactUserId) : null;

    if (transcript.length === 0 && durationSeconds < 5) {
      return NextResponse.json({ ok: false, error: 'Session too short to save' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Build a text summary of the transcript for the content field
    const summary = transcript
      .slice(0, 20) // first 20 turns in summary
      .map((t: { lang?: string; original?: string }) => `[${String(t.lang ?? '').toUpperCase()}] ${String(t.original ?? '')}`)
      .join('\n');

    const translatedSummary = transcript
      .slice(0, 20)
      .map((t: { lang?: string; translated?: string }) => `[${String(t.lang ?? '').toUpperCase()}] ${String(t.translated ?? '')}`)
      .join('\n');

    const metadata = JSON.stringify({
      type: 'room_session',
      durationSeconds,
      languages,
      turnCount,
      transcript: transcript.slice(0, 100), // store up to 100 turns in metadata
    });

    // Save as a voice_message-style entry in messages table
    const [msg] = await sql`
      INSERT INTO messages (
        sender_user_id, receiver_user_id,
        channel, direction, status,
        content, translated_content,
        language, target_language,
        media_name
      ) VALUES (
        ${user.id}::uuid,
        ${contactUserId ? `${contactUserId}::uuid` : null},
        'room_session', 'outbound', 'delivered',
        ${summary || `Room session · ${languages.join(' ↔ ')} · ${turnCount} turns`},
        ${translatedSummary || null},
        ${languages[0] ?? 'en'},
        ${languages[1] ?? 'en'},
        ${`Room session · ${Math.round(durationSeconds / 60)}m · ${languages.join(' ↔ ')}`}
      )
      RETURNING id, created_at
    `;

    return NextResponse.json({ ok: true, messageId: msg.id });
  } catch (err) {
    console.error('[room/save-session]', err);
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 });
  }
}
