/**
 * POST /api/orgs/invites/accept
 * Phase 3: Accept an org invite by token.
 *
 * Body: { token: string }
 * Returns: { success, org, token }  — new JWT with orgId
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createToken } from '@/lib/auth';
import { acceptOrgInvite, getInviteByToken, getOrganizationById } from '@/lib/database/organizations';
import { neon } from '@neondatabase/serverless';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { token } = body as { token?: string };

    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    const invite = await getInviteByToken(token);
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found, expired, or already accepted' }, { status: 404 });
    }

    await acceptOrgInvite(token, user.id);

    const org = await getOrganizationById(invite.orgId);

    // Issue a new JWT with orgId so the caller's next requests are org-scoped
    const sql = neon(process.env.DATABASE_URL!);
    const [row] = await sql`SELECT phone_number FROM users WHERE id = ${user.id}::uuid`;
    const phoneNumber = row?.phone_number ?? user.phoneNumber ?? '';
    const newToken = createToken(user.id, phoneNumber, invite.orgId);

    return NextResponse.json({ success: true, org, token: newToken });
  } catch (err) {
    console.error('[orgs/invites/accept]', err);
    const msg = err instanceof Error ? err.message : 'Failed to accept invite';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
