/**
 * GET /api/email/auth/gmail
 * Phase 56 — Initiates Gmail OAuth 2.0 flow.
 * Redirects user to Google consent screen.
 *
 * Query params: none (user must be authenticated via Bearer token)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getGmailAuthUrl, hasGmailConfig } from '@/lib/email-oauth';
import { createHmac } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
    ?? `Bearer ${request.nextUrl.searchParams.get('token') ?? ''}`;

  const user = await verifyAuthWithTestSupport(authHeader);
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!hasGmailConfig()) {
    return NextResponse.json({
      error: 'Gmail integration not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    }, { status: 503 });
  }

  // State encodes userId to validate in callback (HMAC to prevent CSRF)
  const secret = process.env.CRON_SECRET ?? 'lifesync-oauth-state';
  const timestamp = Date.now();
  const stateData = `${user.id}:${timestamp}`;
  const sig = createHmac('sha256', secret).update(stateData).digest('hex').slice(0, 16);
  const state = Buffer.from(JSON.stringify({ userId: user.id, ts: timestamp, sig })).toString('base64url');

  const url = getGmailAuthUrl(state);
  return NextResponse.redirect(url);
}
