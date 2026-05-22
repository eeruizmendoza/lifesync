/**
 * GET /api/email/auth/outlook
 * Phase 56 — Initiates Microsoft OAuth 2.0 flow for Outlook.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getOutlookAuthUrl, hasOutlookConfig } from '@/lib/email-oauth';
import { createHmac } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
    ?? `Bearer ${request.nextUrl.searchParams.get('token') ?? ''}`;

  const user = await verifyAuthWithTestSupport(authHeader);
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  if (!hasOutlookConfig()) {
    return NextResponse.json({
      error: 'Outlook integration not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.',
    }, { status: 503 });
  }

  const secret = process.env.CRON_SECRET ?? 'lifesync-oauth-state';
  const timestamp = Date.now();
  const stateData = `${user.id}:${timestamp}`;
  const sig = createHmac('sha256', secret).update(stateData).digest('hex').slice(0, 16);
  const state = Buffer.from(JSON.stringify({ userId: user.id, ts: timestamp, sig })).toString('base64url');

  return NextResponse.redirect(getOutlookAuthUrl(state));
}
