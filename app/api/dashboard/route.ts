/**
 * GET /api/dashboard
 * Returns aggregated data for the portal home dashboard.
 *
 * Response:
 * {
 *   stats: {
 *     callsThisMonth: number,
 *     minutesThisMonth: number,
 *     totalCalls: number,
 *     totalMinutes: number,
 *     onlineContacts: number,
 *   },
 *   recentCalls: RecentCall[],        // last 5 calls
 *   annotatedCalls: RecentCall[],     // last 5 calls with notes
 *   onlineContacts: OnlineContact[], // contacts seen in last 90s (max 8)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

interface RecentCall {
  id: string;
  type: string;
  contactName: string | null;
  contactPhone: string | null;
  contactId: string | null;
  durationSeconds: number;
  languagePair: string;
  hasNotes: boolean;
  notesPreview: string | null;
  createdAt: string;
}

interface OnlineContact {
  id: string;
  name: string;
  lastSeenAt: string;
  language: string;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sql = neon(process.env.DATABASE_URL!);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Run all queries in parallel for speed
    const [statsRows, allTimeRows, recentCallRows, annotatedCallRows, onlineContactRows] =
      await Promise.all([

        // This-month stats
        sql`
          SELECT
            COUNT(*)::int                              AS calls_this_month,
            COALESCE(SUM(duration_seconds), 0)::int   AS seconds_this_month
          FROM conversations
          WHERE user_id = ${user.id}::uuid
            AND deleted_at IS NULL
            AND created_at >= ${startOfMonth}
        `,

        // All-time stats
        sql`
          SELECT
            COUNT(*)::int                              AS total_calls,
            COALESCE(SUM(duration_seconds), 0)::int   AS total_seconds
          FROM conversations
          WHERE user_id = ${user.id}::uuid
            AND deleted_at IS NULL
        `,

        // Last 5 calls
        sql`
          SELECT
            c.id,
            c.conversation_type,
            c.duration_seconds,
            c.language_pair,
            c.contact_phone,
            c.contact_id,
            c.notes,
            c.created_at,
            u.name AS contact_name,
            u.phone_number AS contact_phone_number
          FROM conversations c
          LEFT JOIN users u ON u.id = c.contact_id
          WHERE c.user_id = ${user.id}::uuid
            AND c.deleted_at IS NULL
          ORDER BY c.created_at DESC
          LIMIT 5
        `,

        // Last 5 calls with notes (CRM follow-ups)
        sql`
          SELECT
            c.id,
            c.conversation_type,
            c.duration_seconds,
            c.language_pair,
            c.contact_phone,
            c.contact_id,
            c.notes,
            c.created_at,
            u.name AS contact_name,
            u.phone_number AS contact_phone_number
          FROM conversations c
          LEFT JOIN users u ON u.id = c.contact_id
          WHERE c.user_id = ${user.id}::uuid
            AND c.deleted_at IS NULL
            AND c.notes IS NOT NULL
            AND c.notes != ''
          ORDER BY c.created_at DESC
          LIMIT 5
        `,

        // Online contacts (seen in last 90 seconds)
        sql`
          SELECT
            id,
            name,
            phone_number,
            language_preference AS language,
            last_seen_at
          FROM users
          WHERE id::text != ${user.id}
            AND (private IS NULL OR private = false)
            AND last_seen_at >= NOW() - INTERVAL '90 seconds'
          ORDER BY last_seen_at DESC
          LIMIT 8
        `,
      ]);

    const mapCall = (c: any): RecentCall => ({
      id: String(c.id),
      type: String(c.conversation_type),
      contactName: c.contact_name ? String(c.contact_name) : null,
      contactPhone: c.contact_phone_number
        ? String(c.contact_phone_number)
        : c.contact_phone ? String(c.contact_phone) : null,
      contactId: c.contact_id ? String(c.contact_id) : null,
      durationSeconds: Number(c.duration_seconds ?? 0),
      languagePair: String(c.language_pair ?? ''),
      hasNotes: !!(c.notes && String(c.notes).trim()),
      notesPreview: c.notes ? String(c.notes).slice(0, 80) : null,
      createdAt: new Date(String(c.created_at)).toISOString(),
    });

    return NextResponse.json({
      stats: {
        callsThisMonth: Number(statsRows[0]?.calls_this_month ?? 0),
        minutesThisMonth: Math.round(Number(statsRows[0]?.seconds_this_month ?? 0) / 60),
        totalCalls: Number(allTimeRows[0]?.total_calls ?? 0),
        totalMinutes: Math.round(Number(allTimeRows[0]?.total_seconds ?? 0) / 60),
        onlineContacts: onlineContactRows.length,
      },
      recentCalls: recentCallRows.map(mapCall),
      annotatedCalls: annotatedCallRows.map(mapCall),
      onlineContacts: onlineContactRows.map(c => ({
        id: String(c.id),
        name: c.name ? String(c.name) : (c.phone_number ? String(c.phone_number) : 'Unknown'),
        lastSeenAt: c.last_seen_at ? new Date(String(c.last_seen_at)).toISOString() : null,
        language: c.language ? String(c.language) : 'en',
      })) as OnlineContact[],
    });
  } catch (err) {
    console.error('[dashboard]', err);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
