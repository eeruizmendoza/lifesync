/**
 * GET /api/auth/me
 * Get current authenticated user.
 * Phase 3: reads Bearer token from header (primary) or cookie (fallback),
 * returns orgId so the portal layout can redirect to onboarding if needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Accept Bearer token (localStorage) OR cookie (SSR login flow)
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
      return NextResponse.json({ ok: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: decoded.userId,
        phoneNumber: decoded.phoneNumber,
        orgId: decoded.orgId ?? null,
      },
    });
  } catch (error) {
    console.error('[auth/me]', error);
    return NextResponse.json({ ok: false, error: 'Authentication check failed' }, { status: 500 });
  }
}
