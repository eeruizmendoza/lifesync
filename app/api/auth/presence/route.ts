/**
 * POST /api/auth/presence
 * Updates last_seen_at for the authenticated user.
 * Called by the portal layout every 60 seconds to track presence.
 * Lightweight — no body needed, just auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    let rawToken: string | undefined;
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      rawToken = authHeader.slice(7);
    } else {
      rawToken = request.cookies.get('lifesync_token')?.value;
    }
    if (!rawToken) return NextResponse.json({ ok: false }, { status: 401 });

    const decoded = verifyToken(rawToken);
    if (!decoded) return NextResponse.json({ ok: false }, { status: 401 });

    await query(
      'UPDATE users SET last_seen_at = NOW() WHERE id = $1::uuid',
      [decoded.userId]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Non-fatal — presence update failing shouldn't break anything
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
