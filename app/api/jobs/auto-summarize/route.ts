/**
 * POST /api/jobs/auto-summarize
 * Phase 53 — Background job: summarize calls from the past 48 hours that
 * have transcripts but no AI summary yet.
 *
 * Scheduled daily at 3 AM UTC via vercel.json cron.
 * Also callable on-demand with valid CRON_SECRET header.
 *
 * Processes up to 50 calls per run to stay within serverless timeout.
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { summarize, hasAIProvider } from '@/lib/ai-summarizer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for batch processing

export async function POST(request: NextRequest) {
  // Auth: CRON_SECRET header or Vercel cron signature
  const cronSecret = request.headers.get('x-cron-secret')
    ?? request.headers.get('authorization')?.replace('Bearer ', '');
  if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasAIProvider()) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: 'No AI provider configured',
    });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // Ensure migration is applied
  await sql`
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS ai_summary       JSONB,
      ADD COLUMN IF NOT EXISTS ai_summary_at    TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ai_summary_model TEXT
  `.catch(() => {});

  // Find calls in the past 48h without summaries, with duration > 10s
  const pendingCalls = await sql`
    SELECT
      c.id, c.conversation_type, c.duration_seconds, c.language_pair,
      c.contact_id, c.user_id,
      u.name AS contact_name
    FROM conversations c
    LEFT JOIN users u ON u.id = c.contact_id
    WHERE c.ai_summary IS NULL
      AND c.deleted_at IS NULL
      AND c.duration_seconds > 10
      AND c.created_at >= NOW() - INTERVAL '48 hours'
    ORDER BY c.created_at DESC
    LIMIT 50
  `.catch(() => []);

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const call of pendingCalls as any[]) {
    try {
      // Fetch transcript
      const transcriptRows = await sql`
        SELECT t.original_text, t.translated_text, t.start_ms
        FROM call_recording_transcripts t
        JOIN call_recordings r ON r.id = t.recording_id
        JOIN conversations c ON c.id = r.call_id
        WHERE c.id = ${call.id}::uuid
        ORDER BY t.start_ms ASC
        LIMIT 200
      `.catch(() => []);

      const content: string[] = (transcriptRows as any[]).map((t: any) => {
        const ms = t.start_ms ? `[${Math.round(Number(t.start_ms)/1000)}s]` : '';
        if (t.translated_text && t.translated_text !== t.original_text) {
          return `${ms} ${t.original_text} (→ ${t.translated_text})`;
        }
        return `${ms} ${t.original_text ?? ''}`;
      }).filter(Boolean);

      const langPair = call.language_pair ? String(call.language_pair).split('_') : [];

      const result = await summarize({
        kind: 'call',
        content,
        languages: langPair.length === 2 ? langPair : undefined,
        durationSeconds: Number(call.duration_seconds ?? 0),
        contactName: call.contact_name ? String(call.contact_name) : undefined,
      });

      if (result) {
        await sql`
          UPDATE conversations
          SET
            ai_summary       = ${JSON.stringify(result.summary)},
            ai_summary_at    = NOW(),
            ai_summary_model = ${result.model}
          WHERE id = ${call.id}::uuid
        `;
        processed++;
      } else {
        failed++;
        errors.push(`${call.id}: AI summarization returned null`);
      }
    } catch (err) {
      failed++;
      errors.push(`${call.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    failed,
    total: pendingCalls.length,
    errors: errors.slice(0, 5), // cap at 5 for response size
  });
}
