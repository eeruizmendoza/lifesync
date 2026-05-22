/**
 * GET /api/calls/status-check?callId=xxx
 * Caller polls this to find out if receiver answered, rejected, or let it expire.
 * Used by PhoneCallDialog / VideoCallDialog to detect rejection during the "ringing" phase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    let rawToken: string | undefined;
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      rawToken = authHeader.slice(7);
    } else {
      rawToken = request.cookies.get('lifesync_token')?.value;
    }
    if (!rawToken) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    const decoded = verifyToken(rawToken);
    if (!decoded) {
      return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
    }

    const callId = request.nextUrl.searchParams.get('callId');
    if (!callId) {
      return NextResponse.json({ ok: false, error: 'Missing callId' }, { status: 400 });
    }

    const result = await query(
      `SELECT status, answered_at, rejected_at, expires_at
       FROM pending_calls
       WHERE call_id = $1 AND caller_id = $2::uuid
       LIMIT 1`,
      [callId, decoded.userId]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ ok: true, status: 'not_found' });
    }

    const row = result.rows[0];
    const now = Date.now();
    let status = String(row.status);

    // Auto-expire
    if (status === 'ringing' && new Date(row.expires_at as string).getTime() < now) {
      status = 'expired';
    }

    return NextResponse.json({
      ok: true,
      callId,
      status,
      answeredAt: row.answered_at ? new Date(row.answered_at as string).getTime() : null,
      rejectedAt: row.rejected_at ? new Date(row.rejected_at as string).getTime() : null,
    });
  } catch (error) {
    console.error('[calls/status-check]', error);
    return NextResponse.json({ ok: false, error: 'Status check failed' }, { status: 500 });
  }
}
