/**
 * GET  /api/orgs/members          — list members
 * PATCH /api/orgs/members         — update a member's role
 * DELETE /api/orgs/members        — remove a member
 * Phase 3: Org membership management. Requires admin or owner.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  listOrgMembers,
  getOrgMember,
  updateMemberRole,
  removeOrgMember,
  hasOrgRole,
} from '@/lib/database/organizations';
import type { OrgMember } from '@/lib/database/organizations';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const isMember = await getOrgMember(user.orgId, user.id);
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const members = await listOrgMembers(user.orgId);
    return NextResponse.json({ members, total: members.length });
  } catch (err) {
    console.error('[orgs/members GET]', err);
    return NextResponse.json({ error: 'Failed to list members' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const isAdmin = await hasOrgRole(user.orgId, user.id, 'admin');
    if (!isAdmin) return NextResponse.json({ error: 'Requires admin or owner role' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { userId, role } = body as { userId?: string; role?: OrgMember['role'] };

    if (!userId || !role) {
      return NextResponse.json({ error: 'userId and role required' }, { status: 400 });
    }
    if (!['owner', 'admin', 'member', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Prevent demoting the only owner
    if (role !== 'owner') {
      const target = await getOrgMember(user.orgId, userId);
      if (target?.role === 'owner') {
        const members = await listOrgMembers(user.orgId);
        const owners = members.filter(m => m.role === 'owner');
        if (owners.length <= 1) {
          return NextResponse.json({ error: 'Cannot demote the only owner' }, { status: 409 });
        }
      }
    }

    await updateMemberRole(user.orgId, userId, role);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[orgs/members PATCH]', err);
    return NextResponse.json({ error: 'Failed to update member role' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get('userId');

    if (!targetUserId) {
      return NextResponse.json({ error: 'userId query param required' }, { status: 400 });
    }

    // Users can remove themselves; admins can remove others
    if (targetUserId !== user.id) {
      const isAdmin = await hasOrgRole(user.orgId, user.id, 'admin');
      if (!isAdmin) return NextResponse.json({ error: 'Requires admin or owner role' }, { status: 403 });
    }

    // Prevent removing the last owner
    const target = await getOrgMember(user.orgId, targetUserId);
    if (target?.role === 'owner') {
      const members = await listOrgMembers(user.orgId);
      const owners = members.filter(m => m.role === 'owner');
      if (owners.length <= 1) {
        return NextResponse.json({ error: 'Cannot remove the only owner' }, { status: 409 });
      }
    }

    await removeOrgMember(user.orgId, targetUserId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[orgs/members DELETE]', err);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
