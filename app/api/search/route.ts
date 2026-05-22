/**
 * GET /api/search?q=<query>&limit=<5>
 * Global search across contacts, call history, and recordings.
 *
 * Response:
 * {
 *   ok: boolean,
 *   contacts: ContactResult[],
 *   calls: CallResult[],
 *   recordings: RecordingResult[],
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Rate limit: 30 searches per minute per user
    const rl = await rateLimit({ key: `uid:${user.id}:search`, ...RATE_LIMITS.search });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many search requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') ?? '').trim();
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '5', 10), 10);

    if (!q || q.length < 2) {
      return NextResponse.json({ ok: true, contacts: [], calls: [], recordings: [] });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const pattern = `%${q}%`;
    const orgCondition = user.orgId ? user.orgId : null;

    const [contacts, calls, recordings] = await Promise.all([
      // Contacts — match name, phone, email
      sql`
        SELECT
          id,
          name,
          phone_number AS phone,
          email,
          language_preference AS language
        FROM users
        WHERE id != ${user.id}::uuid
          AND (private IS NULL OR private = false)
          AND (
            name ILIKE ${pattern}
            OR phone_number ILIKE ${pattern}
            OR email ILIKE ${pattern}
          )
        ORDER BY
          CASE WHEN name ILIKE ${pattern} THEN 0 ELSE 1 END,
          last_seen_at DESC NULLS LAST
        LIMIT ${limit}
      `,

      // Calls — match contact name, phone, language pair
      sql`
        SELECT
          c.id,
          c.conversation_type AS type,
          c.language_pair,
          c.duration_seconds,
          c.created_at,
          u.name AS contact_name,
          u.phone_number AS contact_phone
        FROM conversations c
        LEFT JOIN users u ON u.id = c.contact_id
        WHERE c.deleted_at IS NULL
          AND c.user_id = ${user.id}::uuid
          AND (
            u.name ILIKE ${pattern}
            OR u.phone_number ILIKE ${pattern}
            OR c.language_pair ILIKE ${pattern}
            OR c.contact_phone ILIKE ${pattern}
          )
        ORDER BY c.created_at DESC
        LIMIT ${limit}
      `,

      // Recordings — match by transcription text content
      sql`
        SELECT DISTINCT
          r.id,
          r.recording_type AS type,
          r.mime_type,
          r.duration_seconds,
          r.created_at,
          t.original_text
        FROM call_recordings r
        LEFT JOIN call_recording_transcripts t ON t.recording_id = r.id
        WHERE r.deleted_at IS NULL
          AND (
            r.org_id = ${orgCondition ?? user.id}::uuid
            OR r.conversation_id IN (
              SELECT id FROM conversations WHERE user_id = ${user.id}::uuid
            )
          )
          AND (
            t.original_text ILIKE ${pattern}
            OR t.translated_text ILIKE ${pattern}
          )
        ORDER BY r.created_at DESC
        LIMIT ${limit}
      `,
    ]);

    return NextResponse.json({
      ok: true,
      contacts: contacts.map((c: Record<string, unknown>) => ({
        id: String(c.id),
        name: c.name ? String(c.name) : null,
        phone: c.phone ? String(c.phone) : null,
        email: c.email ? String(c.email) : null,
        language: c.language ? String(c.language) : null,
      })),
      calls: calls.map((c: Record<string, unknown>) => ({
        id: String(c.id),
        type: String(c.type),
        languagePair: String(c.language_pair ?? ''),
        durationSeconds: Number(c.duration_seconds ?? 0),
        contactName: c.contact_name ? String(c.contact_name) : null,
        contactPhone: c.contact_phone ? String(c.contact_phone) : null,
        createdAt: new Date(String(c.created_at)).toISOString(),
      })),
      recordings: recordings.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        type: String(r.type ?? 'audio'),
        durationSeconds: Number(r.duration_seconds ?? 0),
        snippet: r.original_text ? String(r.original_text).slice(0, 80) : null,
        createdAt: new Date(String(r.created_at)).toISOString(),
      })),
    });
  } catch (err) {
    console.error('[search]', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
