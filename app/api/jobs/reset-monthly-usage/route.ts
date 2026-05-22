/**
 * POST /api/jobs/reset-monthly-usage
 * Phase 3: Cron job — resets calls_this_month to 0 for all active orgs.
 * Runs on the 1st of each month at 00:05 UTC via Vercel Cron.
 *
 * vercel.json cron: "5 0 1 * *"
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export async function POST(req: NextRequest) {
  // Verify this is called by our cron system, not a random HTTP client
  const authHeader = req.headers.get('authorization') ?? '';
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    const result = await sql`
      UPDATE organizations
      SET calls_this_month = 0, updated_at = NOW()
      WHERE is_active = true
      RETURNING id
    `;

    const count = result.length;
    console.info(`[reset-monthly-usage] Reset calls_this_month for ${count} organizations`);

    return NextResponse.json({
      success: true,
      orgsReset: count,
      resetAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[reset-monthly-usage]', err);
    return NextResponse.json({ error: 'Failed to reset monthly usage' }, { status: 500 });
  }
}

// Also support GET so Vercel Cron (which sends GET) works out of the box
export async function GET(req: NextRequest) {
  return POST(req);
}
