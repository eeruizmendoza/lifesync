/**
 * GET /api/orgs/stats
 * Org-level usage analytics for the current month and all time.
 *
 * Response:
 * {
 *   ok: boolean,
 *   thisMonth: { calls, minutes, activeMembers, recordings },
 *   allTime:   { calls, minutes, recordings },
 *   topLanguagePairs: [{ pair, count, pct }],  // top 5 by call count this month
 *   callsByDay: [{ day: 'YYYY-MM-DD', count }], // last 30 days
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireAdminRole } from '@/lib/tenant-middleware';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });
    const roleErr = await requireAdminRole(user);
    if (roleErr) return roleErr;

    const sql = neon(process.env.DATABASE_URL!);
    const orgId = user.orgId;

    // Run all queries in parallel for speed
    const [
      thisMonthCalls,
      allTimeCalls,
      topLangPairs,
      callsByDay,
      thisMonthRecordings,
      allTimeRecordings,
      activeMembers,
    ] = await Promise.all([
      // Calls this month
      sql`
        SELECT
          COUNT(*)::int AS calls,
          COALESCE(SUM(duration_seconds), 0)::int AS total_seconds
        FROM conversations
        WHERE org_id = ${orgId}::uuid
          AND deleted_at IS NULL
          AND created_at >= date_trunc('month', NOW())
      `,

      // All-time calls
      sql`
        SELECT
          COUNT(*)::int AS calls,
          COALESCE(SUM(duration_seconds), 0)::int AS total_seconds
        FROM conversations
        WHERE org_id = ${orgId}::uuid
          AND deleted_at IS NULL
      `,

      // Top language pairs this month (top 5)
      sql`
        SELECT
          language_pair AS pair,
          COUNT(*)::int AS count
        FROM conversations
        WHERE org_id = ${orgId}::uuid
          AND deleted_at IS NULL
          AND language_pair IS NOT NULL
          AND language_pair != ''
          AND created_at >= date_trunc('month', NOW())
        GROUP BY language_pair
        ORDER BY count DESC
        LIMIT 5
      `,

      // Calls per day — last 30 days
      sql`
        SELECT
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
          COUNT(*)::int AS count
        FROM conversations
        WHERE org_id = ${orgId}::uuid
          AND deleted_at IS NULL
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `,

      // Recordings this month
      sql`
        SELECT COUNT(*)::int AS recordings
        FROM call_recordings
        WHERE org_id = ${orgId}::uuid
          AND deleted_at IS NULL
          AND created_at >= date_trunc('month', NOW())
      `,

      // All-time recordings
      sql`
        SELECT COUNT(*)::int AS recordings
        FROM call_recordings
        WHERE org_id = ${orgId}::uuid
          AND deleted_at IS NULL
      `,

      // Active members this month — users who were in at least one call
      sql`
        SELECT COUNT(DISTINCT user_id)::int AS active
        FROM conversations
        WHERE org_id = ${orgId}::uuid
          AND deleted_at IS NULL
          AND created_at >= date_trunc('month', NOW())
      `,
    ]);

    const totalMonthSeconds = thisMonthCalls[0]?.total_seconds ?? 0;
    const totalAllTimeSeconds = allTimeCalls[0]?.total_seconds ?? 0;

    // Calculate percentage for language pairs
    const totalPairCalls = topLangPairs.reduce((s: number, r: { count: number }) => s + r.count, 0);
    const enrichedPairs = topLangPairs.map((r: { pair: string; count: number }) => ({
      pair: r.pair,
      count: r.count,
      pct: totalPairCalls > 0 ? Math.round((r.count / totalPairCalls) * 100) : 0,
    }));

    return NextResponse.json({
      ok: true,
      thisMonth: {
        calls: thisMonthCalls[0]?.calls ?? 0,
        minutes: Math.round(totalMonthSeconds / 60),
        activeMembers: activeMembers[0]?.active ?? 0,
        recordings: thisMonthRecordings[0]?.recordings ?? 0,
      },
      allTime: {
        calls: allTimeCalls[0]?.calls ?? 0,
        minutes: Math.round(totalAllTimeSeconds / 60),
        recordings: allTimeRecordings[0]?.recordings ?? 0,
      },
      topLanguagePairs: enrichedPairs,
      callsByDay: callsByDay.map((r: { day: string; count: number }) => ({
        day: r.day,
        count: r.count,
      })),
    });
  } catch (err) {
    console.error('[orgs/stats]', err);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
