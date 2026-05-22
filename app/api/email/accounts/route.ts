/**
 * GET  /api/email/accounts — list user's connected email accounts
 * POST /api/email/accounts — trigger manual sync (queues background job)
 * DELETE /api/email/accounts?accountId=X — disconnect an account
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';
import { hasGmailConfig, hasOutlookConfig } from '@/lib/email-oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await verifyAuthWithTestSupport(authHeader);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);

  // Apply migration if needed
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

  const rows = await sql`
    SELECT id, provider, email, display_name, is_active, last_synced_at, created_at
    FROM connected_accounts
    WHERE user_id = ${user.id}::uuid
    ORDER BY created_at DESC
  `.catch(() => []);

  return NextResponse.json({
    accounts: (rows as any[]).map(r => ({
      id:           String(r.id),
      provider:     String(r.provider),
      email:        String(r.email),
      displayName:  r.display_name ? String(r.display_name) : null,
      isActive:     Boolean(r.is_active),
      lastSyncedAt: r.last_synced_at ? new Date(String(r.last_synced_at)).toISOString() : null,
      connectedAt:  new Date(String(r.created_at)).toISOString(),
    })),
    providers: {
      gmail:   { configured: hasGmailConfig(),   authUrl: '/api/email/auth/gmail'   },
      outlook: { configured: hasOutlookConfig(),  authUrl: '/api/email/auth/outlook' },
    },
  });
}

export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await verifyAuthWithTestSupport(authHeader);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = request.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    UPDATE connected_accounts
    SET is_active = FALSE, updated_at = NOW()
    WHERE id = ${accountId}::uuid
      AND user_id = ${user.id}::uuid
  `;

  return NextResponse.json({ ok: true });
}
