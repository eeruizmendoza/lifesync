/**
 * GET /api/admin/stats
 * Platform-wide aggregate stats for the super-admin dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { checkSuperAdmin } from '@/lib/admin-auth';
import { getPlatformStats } from '@/lib/database/admin';

export async function GET(request: NextRequest) {
  try {
    // Auth
    const authHeader = request.headers.get('authorization');
    const rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : request.cookies.get('lifesync_token')?.value;

    if (!rawToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = verifyToken(rawToken);
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Super-admin gate
    if (!checkSuperAdmin(decoded.phoneNumber)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const stats = await getPlatformStats();
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    console.error('[admin/stats]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
