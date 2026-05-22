/**
 * POST /api/orgs/invites/link
 * Any org member (not just admin) can generate a shareable invite link.
 * Link is a generic "join our org" URL — no email required.
 * Role is always 'member' for member-generated links.
 * Admins/owners can specify a custom role.
 *
 * Returns: { inviteUrl, token, expiresAt }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  isOrgMember,
  hasOrgRole,
  getOrganizationById,
  listOrgMembers,
} from '@/lib/database/organizations';
import { neon } from '@neondatabase/serverless';
import * as crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'You must be in an organization to invite members.' }, { status: 400 });

    const isMember = await isOrgMember(user.orgId, user.id);
    if (!isMember) return NextResponse.json({ error: 'Not an org member' }, { status: 403 });

    const isAdmin = await hasOrgRole(user.orgId, user.id, 'admin');

    const body = await req.json().catch(() => ({}));
    // Members can only invite at 'member' role; admins can specify
    const role = isAdmin ? (body.role ?? 'member') : 'member';

    // Check user limit
    const org = await getOrganizationById(user.orgId);
    if (org && org.maxUsers > 0) {
      const members = await listOrgMembers(user.orgId);
      if (members.length >= org.maxUsers) {
        return NextResponse.json(
          { error: `Team seat limit reached (${org.maxUsers} seats). Upgrade your plan to add more members.` },
          { status: 402 }
        );
      }
    }

    // Generate a generic invite token (email = a placeholder)
    const token = crypto.randomBytes(32).toString('hex');
    const placeholder = `invite-link-${token.slice(0, 8)}@lifesync.internal`;

    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      INSERT INTO organization_invites (org_id, invited_by, email, role, token)
      VALUES (${user.orgId}::uuid, ${user.id}::uuid, ${placeholder}, ${role}, ${token})
      ON CONFLICT (org_id, email) DO UPDATE SET
        token = ${token},
        role  = ${role},
        expires_at  = NOW() + INTERVAL '7 days',
        accepted_at = NULL,
        created_at  = NOW()
    `;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lifesync.app';
    const inviteUrl = `${appUrl}/invite/${token}`;

    return NextResponse.json({
      ok: true,
      inviteUrl,
      token,
      orgName: org?.name ?? 'your organization',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[orgs/invites/link]', err);
    return NextResponse.json({ error: 'Failed to generate invite link' }, { status: 500 });
  }
}
