/**
 * GET /api/orgs
 * Phase 3: Get the caller's organization details + quota status.
 *
 * PATCH /api/orgs
 * Update org settings (name, logoUrl, website). Requires admin or owner role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getOrganizationById,
  updateOrganization,
  checkOrgQuotas,
  hasOrgRole,
} from '@/lib/database/organizations';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!user.orgId) {
      return NextResponse.json({ org: null, message: 'User has no organization' });
    }

    const [org, quotas] = await Promise.all([
      getOrganizationById(user.orgId),
      checkOrgQuotas(user.orgId),
    ]);

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    return NextResponse.json({ org, quotas });
  } catch (err) {
    console.error('[orgs GET]', err);
    return NextResponse.json({ error: 'Failed to fetch organization' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'User has no organization' }, { status: 400 });

    const isAdmin = await hasOrgRole(user.orgId, user.id, 'admin');
    if (!isAdmin) {
      return NextResponse.json({ error: 'Requires admin or owner role' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, logoUrl, website } = body as { name?: string; logoUrl?: string; website?: string };

    if (!name && logoUrl === undefined && website === undefined) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    await updateOrganization(user.orgId, {
      ...(name ? { name: name.trim() } : {}),
      ...(logoUrl !== undefined ? { logoUrl } : {}),
      ...(website !== undefined ? { website } : {}),
    });

    const updated = await getOrganizationById(user.orgId);
    return NextResponse.json({ org: updated });
  } catch (err) {
    console.error('[orgs PATCH]', err);
    return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
  }
}
