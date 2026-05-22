/**
 * POST /api/jobs/weekly-digest
 * Weekly cron (Monday 9 AM UTC): for every active org, compute last-7-days
 * usage stats and email a digest to all admins/owners who have an email address.
 *
 * Auth: CRON_SECRET header.
 * Registered in vercel.json: "0 9 * * 1" (Monday 9 AM UTC).
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { sendWeeklyDigestEmail } from '@/lib/email-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // up to 2 min for large orgs

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // Fetch all non-suspended orgs with at least one call in the last 7 days
  const activeOrgs = await sql`
    SELECT DISTINCT o.id, o.name
    FROM organizations o
    WHERE o.is_suspended = false
      AND EXISTS (
        SELECT 1 FROM conversations c
        WHERE c.org_id = o.id
          AND c.created_at >= NOW() - INTERVAL '7 days'
          AND c.deleted_at IS NULL
      )
  `;

  // Build week label e.g. "May 13–19, 2026"
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() - now.getDay()); // last Sunday
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekEnd.getDate() - 6); // previous Monday
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekLabel = `${fmt(weekStart)}–${fmt(weekEnd)}, ${weekEnd.getFullYear()}`;

  let sent = 0;
  let errors = 0;

  for (const org of activeOrgs) {
    try {
      const orgId = String(org.id);

      // Compute stats for the last 7 days
      const [stats] = await sql`
        SELECT
          COUNT(*)::int AS total_calls,
          COALESCE(SUM(duration_seconds), 0)::int AS total_seconds
        FROM conversations
        WHERE org_id = ${orgId}::uuid
          AND deleted_at IS NULL
          AND created_at >= NOW() - INTERVAL '7 days'
      `;

      const [activeRow] = await sql`
        SELECT COUNT(DISTINCT user_id)::int AS active_members
        FROM conversations
        WHERE org_id = ${orgId}::uuid
          AND deleted_at IS NULL
          AND created_at >= NOW() - INTERVAL '7 days'
      `;

      const [topPairRow] = await sql`
        SELECT language_pair, COUNT(*)::int AS cnt
        FROM conversations
        WHERE org_id = ${orgId}::uuid
          AND deleted_at IS NULL
          AND language_pair IS NOT NULL
          AND language_pair != ''
          AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY language_pair
        ORDER BY cnt DESC
        LIMIT 1
      `;

      const [newMembersRow] = await sql`
        SELECT COUNT(*)::int AS cnt
        FROM organization_members
        WHERE org_id = ${orgId}::uuid
          AND joined_at >= NOW() - INTERVAL '7 days'
      `;

      const digest = {
        orgName: String(org.name),
        weekLabel,
        totalCalls: stats?.total_calls ?? 0,
        totalMinutes: Math.round((stats?.total_seconds ?? 0) / 60),
        activeMembersCount: activeRow?.active_members ?? 0,
        topLanguagePair: topPairRow?.language_pair ? String(topPairRow.language_pair) : null,
        newMembersCount: newMembersRow?.cnt ?? 0,
      };

      // Send to all admins/owners who have an email
      const admins = await sql`
        SELECT u.id, u.name, u.email
        FROM organization_members om
        JOIN users u ON u.id = om.user_id
        WHERE om.org_id = ${orgId}::uuid
          AND om.role IN ('admin', 'owner')
          AND u.email IS NOT NULL
          AND u.email != ''
      `;

      for (const admin of admins) {
        await sendWeeklyDigestEmail({
          toEmail: String(admin.email),
          userName: admin.name ? String(admin.name) : null,
          digest,
        });
        sent++;
      }
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    orgsProcessed: activeOrgs.length,
    emailsSent: sent,
    errors,
    weekLabel,
    ts: new Date().toISOString(),
  });
}
