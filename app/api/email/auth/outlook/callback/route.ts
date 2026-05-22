/**
 * GET /api/email/auth/outlook/callback
 * Phase 56 — Outlook OAuth callback.
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { exchangeOutlookCode, encryptToken } from '@/lib/email-oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const code  = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');

  const redirectBase = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lifesync.app';

  if (error || !code || !state) {
    return NextResponse.redirect(
      `${redirectBase}/settings?tab=connected&error=${encodeURIComponent(error ?? 'OAuth cancelled')}`,
    );
  }

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    userId = decoded.userId;
    if (!userId) throw new Error('Invalid state');
  } catch {
    return NextResponse.redirect(`${redirectBase}/settings?tab=connected&error=invalid_state`);
  }

  const tokens = await exchangeOutlookCode(code);
  if (!tokens) {
    return NextResponse.redirect(`${redirectBase}/settings?tab=connected&error=token_exchange_failed`);
  }

  const encryptedAccess  = encryptToken(tokens.accessToken);
  const encryptedRefresh = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;

  if (!encryptedAccess) {
    return NextResponse.redirect(`${redirectBase}/settings?tab=connected&error=encryption_failed`);
  }

  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    CREATE TABLE IF NOT EXISTS connected_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL, provider TEXT NOT NULL, email TEXT NOT NULL,
      display_name TEXT, access_token TEXT NOT NULL, refresh_token TEXT,
      token_expires_at TIMESTAMPTZ, scopes TEXT[], is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_synced_at TIMESTAMPTZ, sync_cursor TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, provider, email)
    )
  `.catch(() => {});

  await sql`
    INSERT INTO connected_accounts (
      user_id, provider, email, display_name,
      access_token, refresh_token, token_expires_at, is_active
    ) VALUES (
      ${userId}::uuid, 'outlook', ${tokens.email}, ${tokens.displayName},
      ${encryptedAccess}, ${encryptedRefresh}, ${tokens.expiresAt.toISOString()}, TRUE
    )
    ON CONFLICT (user_id, provider, email) DO UPDATE SET
      access_token     = EXCLUDED.access_token,
      refresh_token    = COALESCE(EXCLUDED.refresh_token, connected_accounts.refresh_token),
      token_expires_at = EXCLUDED.token_expires_at,
      is_active        = TRUE,
      display_name     = EXCLUDED.display_name,
      updated_at       = NOW()
  `.catch(() => {});

  return NextResponse.redirect(`${redirectBase}/settings?tab=connected&success=outlook`);
}
