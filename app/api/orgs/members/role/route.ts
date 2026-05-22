/**
 * GET /api/orgs/members/role
 * Returns the current user's role in their org.
 * Used by UI components to conditionally show admin-only features.
 * Response: { role: 'owner' | 'admin' | 'member' | 'viewer' | null }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getOrgMember } from '@/lib/database/organizations';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ role: null });

    const member = await getOrgMember(user.orgId, user.id);
    return NextResponse.json({ ok: true, role: member?.role ?? null });
  } catch (err) {
    console.error('[orgs/members/role]', err);
    return NextResponse.json({ role: null });
  }
}
