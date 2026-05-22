/**
 * POST /api/jobs/cleanup-rate-limits
 * Deletes rate_limit_log rows older than 1 hour.
 * Run hourly via Vercel cron.
 * Secured by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const result = await sql`
      DELETE FROM rate_limit_log
      WHERE updated_at < NOW() - INTERVAL '1 hour'
    `;
    return NextResponse.json({ ok: true, deleted: result.length ?? 0 });
  } catch (err) {
    console.error('[cleanup-rate-limits]', err);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
