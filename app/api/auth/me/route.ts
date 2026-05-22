/**
 * GET /api/auth/me
 * Get current authenticated user.
 * Phase 3: reads Bearer token from header (primary) or cookie (fallback),
 * returns orgId so the portal layout can redirect to onboarding if needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/db';
import { checkSuperAdmin } from '@/lib/admin-auth';

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

    // Fetch profile fields from DB (JWT only carries userId/phoneNumber/orgId)
    let name: string | null = null;
    let email: string | null = null;
    let language: string | null = null;
    let notificationCalls = true;
    let notificationInvites = true;
    let notificationQuota = true;
    let notificationDigest = true;
    try {
      const result = await query(
        'SELECT name, email, language_preference, notification_calls, notification_invites, notification_quota, notification_digest FROM users WHERE id = $1',
        [decoded.userId]
      );
      if (result.rows[0]) {
        name = result.rows[0].name ?? null;
        email = result.rows[0].email ?? null;
        language = result.rows[0].language_preference ?? null;
        notificationCalls = result.rows[0].notification_calls ?? true;
        notificationInvites = result.rows[0].notification_invites ?? true;
        notificationQuota = result.rows[0].notification_quota ?? true;
        notificationDigest = result.rows[0].notification_digest ?? true;
      }
    } catch {
      // Non-fatal — DB down or user not found; return without profile fields
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: decoded.userId,
        phoneNumber: decoded.phoneNumber,
        name,
        email,
        language: language ?? 'en',
        notificationCalls,
        notificationInvites,
        notificationQuota,
        notificationDigest,
        orgId: decoded.orgId ?? null,
        isAdmin: checkSuperAdmin(decoded.phoneNumber),
      },
    });
  } catch (error) {
    console.error('[auth/me]', error);
    return NextResponse.json({ ok: false, error: 'Authentication check failed' }, { status: 500 });
  }
}
