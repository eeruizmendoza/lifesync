/**
 * GET /api/calls/incoming
 * Returns pending incoming calls for the authenticated user.
 * Designed for polling every 3 seconds from the portal layout.
 *
 * Also handles PATCH to update call status (answer/reject from receiver side)
 * and auto-expires stale calls older than 30 seconds.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/db';

// ─── GET: poll for incoming calls ────────────────────────────────────────────

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

    // Auto-expire old ringing calls first (> 30 seconds old)
    try {
      await query(
        `UPDATE pending_calls SET status = 'expired'
         WHERE status = 'ringing' AND expires_at < NOW()`,
        []
      );
    } catch { /* non-fatal */ }

    // Fetch ringing calls where this user is the receiver
    const result = await query(
      `SELECT
         pc.call_id,
         pc.source_language,
         pc.target_language,
         pc.call_type,
         pc.caller_name,
         pc.caller_phone,
         pc.created_at,
         pc.expires_at,
         u.name  AS caller_display_name,
         u.phone_number AS caller_phone_number
       FROM pending_calls pc
       LEFT JOIN users u ON u.id = pc.caller_id
       WHERE pc.receiver_id = $1::uuid
         AND pc.status = 'ringing'
         AND pc.expires_at > NOW()
       ORDER BY pc.created_at DESC
       LIMIT 1`,
      [decoded.userId]
    );

    const calls = result.rows.map(row => ({
      callId: String(row.call_id),
      sourceLanguage: String(row.source_language),
      targetLanguage: String(row.target_language),
      callType: String(row.call_type) as 'audio' | 'video',
      callerName: String(row.caller_display_name ?? row.caller_name ?? 'Unknown'),
      callerPhone: String(row.caller_phone_number ?? row.caller_phone ?? ''),
      createdAt: new Date(row.created_at as string).getTime(),
      expiresAt: new Date(row.expires_at as string).getTime(),
    }));

    return NextResponse.json({ ok: true, calls });
  } catch (error) {
    console.error('[calls/incoming] GET error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to fetch incoming calls' }, { status: 500 });
  }
}

// ─── PATCH: receiver answers or rejects ──────────────────────────────────────

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { callId, action } = body as { callId: string; action: 'answer' | 'reject' };

    if (!callId || !['answer', 'reject'].includes(action)) {
      return NextResponse.json(
        { ok: false, error: 'Missing callId or action (answer|reject)' },
        { status: 400 }
      );
    }

    const newStatus = action === 'answer' ? 'answered' : 'rejected';
    const timestampCol = action === 'answer' ? 'answered_at' : 'rejected_at';

    const result = await query(
      `UPDATE pending_calls
       SET status = $1, ${timestampCol} = NOW()
       WHERE call_id = $2
         AND receiver_id = $3::uuid
         AND status = 'ringing'
       RETURNING call_id, status`,
      [newStatus, callId, decoded.userId]
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { ok: false, error: 'Call not found or already handled' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, callId, status: newStatus });
  } catch (error) {
    console.error('[calls/incoming] PATCH error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to update call status' }, { status: 500 });
  }
}
