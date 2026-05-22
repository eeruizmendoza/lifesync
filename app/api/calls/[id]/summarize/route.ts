/**
 * POST /api/calls/[id]/summarize
 * Phase 53 — Generate (or re-generate) an AI summary for a specific call.
 *
 * Requires the caller to own the call.
 * Returns { ok, summary } or { ok: false, error }.
 *
 * The summary is stored in conversations.ai_summary (JSONB).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';
import { summarize, hasAIProvider } from '@/lib/ai-summarizer';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: callId } = await context.params;

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!hasAIProvider()) {
      return NextResponse.json({
        ok: false,
        error: 'No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.',
      }, { status: 503 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Fetch the call + transcript
    const callRows = await sql`
      SELECT
        c.id, c.conversation_type, c.duration_seconds, c.language_pair,
        c.contact_phone, c.contact_id, c.created_at,
        u.name AS contact_name
      FROM conversations c
      LEFT JOIN users u ON u.id = c.contact_id
      WHERE c.id = ${callId}::uuid
        AND c.user_id = ${user.id}::uuid
        AND c.deleted_at IS NULL
      LIMIT 1
    `;

    if (!callRows.length) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    const call = callRows[0];

    // Fetch transcript lines (from call_recording_transcripts)
    const transcriptRows = await sql`
      SELECT t.original_text, t.translated_text, t.start_ms
      FROM call_recording_transcripts t
      JOIN call_recordings r ON r.id = t.recording_id
      JOIN conversations c ON c.id = r.call_id
      WHERE c.id = ${callId}::uuid
      ORDER BY t.start_ms ASC
      LIMIT 200
    `.catch(() => []);

    // Also check messages table for room_session content
    const messageRows = await sql`
      SELECT content, translated_content, direction, channel, created_at
      FROM messages
      WHERE conversation_id = ${callId}::uuid
        AND deleted_at IS NULL
        AND channel IN ('in_app_chat','voice_message','room_session')
      ORDER BY created_at ASC
      LIMIT 100
    `.catch(() => []);

    // Build content array for summarizer
    const content: string[] = [];

    // Add transcript lines
    transcriptRows.forEach((t: any) => {
      if (t.original_text) {
        const ms = t.start_ms ? `[${Math.round(Number(t.start_ms)/1000)}s]` : '';
        if (t.translated_text && t.translated_text !== t.original_text) {
          content.push(`${ms} ${t.original_text} (→ ${t.translated_text})`);
        } else {
          content.push(`${ms} ${t.original_text}`);
        }
      }
    });

    // Add chat messages if any
    messageRows.forEach((m: any) => {
      const dir = m.direction === 'inbound' ? `${call.contact_name ?? 'Contact'}` : 'Me';
      const text = m.translated_content ?? m.content ?? '';
      if (text) content.push(`[${m.channel}] ${dir}: ${text}`);
    });

    // Parse language pair
    const langPair = call.language_pair ? String(call.language_pair).split('_') : [];

    const result = await summarize({
      kind: 'call',
      content,
      languages: langPair.length === 2 ? langPair : undefined,
      durationSeconds: Number(call.duration_seconds ?? 0),
      contactName: call.contact_name ? String(call.contact_name) : undefined,
    });

    if (!result) {
      return NextResponse.json({ ok: false, error: 'AI summarization failed' }, { status: 500 });
    }

    // Store in DB — apply migration first if column doesn't exist
    await sql`
      ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS ai_summary       JSONB,
        ADD COLUMN IF NOT EXISTS ai_summary_at    TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS ai_summary_model TEXT
    `.catch(() => {});

    await sql`
      UPDATE conversations
      SET
        ai_summary       = ${JSON.stringify(result.summary)},
        ai_summary_at    = NOW(),
        ai_summary_model = ${result.model}
      WHERE id = ${callId}::uuid
        AND user_id = ${user.id}::uuid
    `;

    return NextResponse.json({ ok: true, summary: result.summary, model: result.model });

  } catch (err) {
    console.error('[calls/summarize]', err);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}

/**
 * GET /api/calls/[id]/summarize
 * Retrieve existing summary without regenerating.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: callId } = await context.params;

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sql = neon(process.env.DATABASE_URL!);

    const rows = await sql`
      SELECT ai_summary, ai_summary_at, ai_summary_model
      FROM conversations
      WHERE id = ${callId}::uuid
        AND user_id = ${user.id}::uuid
        AND deleted_at IS NULL
      LIMIT 1
    `.catch(() => []);

    if (!rows.length) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    const row = rows[0];
    return NextResponse.json({
      ok: true,
      summary: row.ai_summary ?? null,
      model: row.ai_summary_model ?? null,
      generatedAt: row.ai_summary_at ?? null,
    });

  } catch (err) {
    console.error('[calls/summarize GET]', err);
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}
