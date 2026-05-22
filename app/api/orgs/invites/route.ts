/**
 * GET  /api/orgs/invites           — list pending invites
 * POST /api/orgs/invites           — send a new invite
 * Phase 3: Org invitation management. Requires admin or owner to send.
 *
 * POST body: { email, role? }
 * Returns: { invite } — includes token for constructing the invite URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  listOrgInvites,
  createOrgInvite,
  hasOrgRole,
  listOrgMembers,
  getOrganizationById,
} from '@/lib/database/organizations';
import type { OrgMember } from '@/lib/database/organizations';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const isAdmin = await hasOrgRole(user.orgId, user.id, 'admin');
    if (!isAdmin) return NextResponse.json({ error: 'Requires admin or owner role' }, { status: 403 });

    const invites = await listOrgInvites(user.orgId);
    return NextResponse.json({ invites, total: invites.length });
  } catch (err) {
    console.error('[orgs/invites GET]', err);
    return NextResponse.json({ error: 'Failed to list invites' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const isAdmin = await hasOrgRole(user.orgId, user.id, 'admin');
    if (!isAdmin) return NextResponse.json({ error: 'Requires admin or owner role' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { email, role = 'member' } = body as { email?: string; role?: OrgMember['role'] };

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!['admin', 'member', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be admin, member, or viewer' }, { status: 400 });
    }

    // Enforce user limit before inviting
    const org = await getOrganizationById(user.orgId);
    if (org && org.maxUsers > 0) {
      const members = await listOrgMembers(user.orgId);
      if (members.length >= org.maxUsers) {
        return NextResponse.json(
          { error: `User limit reached (${org.maxUsers}). Upgrade your plan to add more members.` },
          { status: 402 }
        );
      }
    }

    const invite = await createOrgInvite(user.orgId, user.id, email, role);

    // Build invite URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lifesync.app';
    const inviteUrl = `${appUrl}/invite/${invite.token}`;

    // TODO: Send invite email via SendGrid/Resend (Phase 3.5)
    console.info(`[orgs/invites] Invite created for ${email} → ${inviteUrl}`);

    return NextResponse.json({ invite, inviteUrl }, { status: 201 });
  } catch (err) {
    console.error('[orgs/invites POST]', err);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }
}
