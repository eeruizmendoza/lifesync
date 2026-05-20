/**
 * GET /api/auth/me
 * Get current authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Get token from cookie
    const token = request.cookies.get('lifesync_token')?.value;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Verify token
    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: decoded.userId,
          phoneNumber: decoded.phoneNumber,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[auth/me]', error);
    return NextResponse.json(
      { ok: false, error: 'Authentication check failed' },
      { status: 500 }
    );
  }
}
