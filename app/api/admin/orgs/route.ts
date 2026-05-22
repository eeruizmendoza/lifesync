/**
 * GET /api/admin/orgs?search=&limit=&offset=
 * List all orgs with member counts and usage (super-admin only).
 *
 * PATCH /api/admin/orgs
 * Update an org's plan or suspension status.
 * Body: { orgId, action: 'set_plan' | 'suspend' | 'unsuspend', plan?, reason? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { checkSuperAdmin } from '@/lib/admin-auth';
import { listAllOrgs, adminSetOrgPlan, adminSetOrgSuspension } from '@/lib/database/admin';

function resolveAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const rawToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : request.cookies.get('lifesync_token')?.value;
  if (!rawToken) return null;
  return verifyToken(rawToken);
}

export async function GET(request: NextRequest) {
  try {
    const decoded = resolveAuth(request);
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!checkSuperAdmin(decoded.phoneNumber)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || undefined;

    const { orgs, total } = await listAllOrgs(limit, offset, search);
    return NextResponse.json({ ok: true, orgs, total, limit, offset });
  } catch (error) {
    console.error('[admin/orgs GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const decoded = resolveAuth(request);
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!checkSuperAdmin(decoded.phoneNumber)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { orgId, action, plan, reason } = body;

    if (!orgId || !action) {
      return NextResponse.json({ error: 'orgId and action are required' }, { status: 400 });
    }

    if (action === 'set_plan') {
      if (!['trial', 'starter', 'pro', 'enterprise'].includes(plan)) {
        return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
      }
      await adminSetOrgPlan(orgId, plan);
      return NextResponse.json({ ok: true, message: `Plan updated to ${plan}` });
    }

    if (action === 'suspend') {
      await adminSetOrgSuspension(orgId, true, reason);
      return NextResponse.json({ ok: true, message: 'Organization suspended' });
    }

    if (action === 'unsuspend') {
      await adminSetOrgSuspension(orgId, false);
      return NextResponse.json({ ok: true, message: 'Organization unsuspended' });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[admin/orgs PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
