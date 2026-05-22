/**
 * POST /api/jobs/check-quotas
 * Daily cron job: scan every active org, fire quota_warning notifications
 * for any org that is at ≥80% of calls or storage limits.
 *
 * Authenticated via CRON_SECRET header (same pattern as cleanup-recordings).
 * Scheduled at 9:00 AM UTC daily via vercel.json cron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyOrgQuotaIfNeeded } from '@/lib/database/organizations';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Lightweight auth — CRON_SECRET or internal header
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // Fetch all active (non-suspended) org IDs that have a plan with finite limits
  const orgs = await sql`
    SELECT o.id
    FROM organizations o
    JOIN plan_limits pl ON pl.plan = o.plan
    WHERE o.is_suspended = false
      AND (
        (pl.max_calls_per_month > 0 AND o.calls_this_month >= pl.max_calls_per_month * 0.8)
        OR
        (pl.max_storage_bytes > 0 AND o.storage_used_bytes >= pl.max_storage_bytes * 0.8)
      )
  `;

  let notified = 0;
  let errors = 0;

  for (const row of orgs) {
    try {
      await notifyOrgQuotaIfNeeded(String(row.id));
      notified++;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    orgsChecked: orgs.length,
    notified,
    errors,
    ts: new Date().toISOString(),
  });
}
