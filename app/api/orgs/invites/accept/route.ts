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
import { sendNotificationEmail } from '@/lib/email-service';
import { deliverWebhookEvent } from '@/lib/webhook-service';
import { logAuditEvent } from '@/lib/audit-log';

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
    const [row] = await sql`SELECT phone_number, name FROM users WHERE id = ${user.id}::uuid`;
    const phoneNumber = row?.phone_number ?? user.phoneNumber ?? '';
    const newToken = createToken(user.id, phoneNumber, invite.orgId);

    // Notify all existing org admins that a new member joined
    try {
      const joinerName = row?.name ?? phoneNumber ?? 'Someone';
      const orgName = org?.name ?? 'your organization';
      const admins = await sql`
        SELECT user_id FROM organization_members
        WHERE org_id = ${invite.orgId}::uuid
          AND role IN ('admin', 'owner')
          AND user_id != ${user.id}::uuid
      `;
      const joinTitle = joinerName + ' joined ' + orgName;
      const joinBody = 'A new member has joined your organization.';
      for (const admin of admins) {
        await sql`
          INSERT INTO user_notifications (user_id, org_id, type, title, body, link)
          VALUES (
            ${admin.user_id}::uuid,
            ${invite.orgId}::uuid,
            'member_joined',
            ${joinTitle},
            ${joinBody},
            '/organization'
          )
        `;
        // Email notification — non-blocking
        sendNotificationEmail(String(admin.user_id), 'member_joined', {
          title: joinTitle,
          body: joinBody,
          orgName,
        }).catch(() => {});
      }
    } catch { /* non-fatal */ }

    // Audit log
    logAuditEvent({
      orgId: invite.orgId,
      actorId: user.id,
      actorName: String(row?.name ?? row?.phone_number ?? 'Unknown'),
      eventType: 'member.joined',
      targetType: 'member',
      targetId: user.id,
    }).catch(() => {});

    // Webhook: member.joined (non-blocking)
    deliverWebhookEvent(invite.orgId, 'member.joined', {
      userId: user.id,
      orgId: invite.orgId,
      inviteToken: token,
      joinedAt: new Date().toISOString(),
    }).catch(() => {});

    return NextResponse.json({ success: true, org, token: newToken });
  } catch (err) {
    console.error('[orgs/invites/accept]', err);
    const msg = err instanceof Error ? err.message : 'Failed to accept invite';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
