/**
 * GET /api/orgs/members/stats
 * Returns per-member activity statistics for the current org.
 * Accessible to any org member (admin for full detail view, members for directory).
 *
 * Response:
 * {
 *   ok: boolean,
 *   members: MemberStat[],
 * }
 *
 * MemberStat: {
 *   userId, name, email, phone, avatarUrl, role, joinedAt,
 *   lastSeenAt, isOnline, isRecent,
 *   totalCalls, totalMinutes
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getOrgMember } from '@/lib/database/organizations';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    // Must be an org member to view the directory
    const membership = await getOrgMember(user.orgId, user.id);
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const sql = neon(process.env.DATABASE_URL!);

    const rows = await sql`
      SELECT
        om.user_id,
        om.role,
        om.joined_at,
        u.name,
        u.email,
        u.phone_number,
        u.avatar_url,
        u.last_seen_at,
        COUNT(DISTINCT c.id)::int            AS total_calls,
        COALESCE(SUM(c.duration_seconds), 0)::int AS total_seconds
      FROM organization_members om
      JOIN users u ON u.id = om.user_id
      LEFT JOIN conversations c
        ON c.user_id = om.user_id
        AND c.deleted_at IS NULL
      WHERE om.org_id = ${user.orgId}::uuid
      GROUP BY om.user_id, om.role, om.joined_at,
               u.name, u.email, u.phone_number, u.avatar_url, u.last_seen_at
      ORDER BY total_calls DESC, u.name ASC
    `;

    const now = Date.now();
    const members = rows.map(r => {
      const lastSeen = r.last_seen_at ? new Date(String(r.last_seen_at)).getTime() : null;
      const secondsAgo = lastSeen ? Math.floor((now - lastSeen) / 1000) : null;
      return {
        userId: String(r.user_id),
        name: r.name ? String(r.name) : (r.email ? String(r.email).split('@')[0] : 'Unknown'),
        email: r.email ? String(r.email) : null,
        phone: r.phone_number ? String(r.phone_number) : null,
        avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
        role: String(r.role) as 'owner' | 'admin' | 'member' | 'viewer',
        joinedAt: r.joined_at ? new Date(String(r.joined_at)).toISOString() : null,
        lastSeenAt: lastSeen ? new Date(lastSeen).toISOString() : null,
        isOnline: secondsAgo !== null && secondsAgo < 90,
        isRecent: secondsAgo !== null && secondsAgo < 14400, // 4 hours
        totalCalls: Number(r.total_calls ?? 0),
        totalMinutes: Math.round(Number(r.total_seconds ?? 0) / 60),
      };
    });

    return NextResponse.json({ ok: true, members });
  } catch (err) {
    console.error('[orgs/members/stats]', err);
    return NextResponse.json({ error: 'Failed to load member stats' }, { status: 500 });
  }
}
