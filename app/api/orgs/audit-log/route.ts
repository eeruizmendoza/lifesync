/**
 * GET /api/orgs/audit-log
 * Returns paginated security audit log for the org.
 * Admin/owner only.
 *
 * Query params: limit (default 50), offset (default 0)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { requireAdminRole } from '@/lib/tenant-middleware';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });
    const roleErr = await requireAdminRole(user);
    if (roleErr) return roleErr;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    const sql = neon(process.env.DATABASE_URL!);

    const [events, countRow] = await Promise.all([
      sql`
        SELECT id, actor_id, actor_name, event_type, target_type, target_id, target_name, metadata, created_at
        FROM org_audit_log
        WHERE org_id = ${user.orgId}::uuid
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::int AS total FROM org_audit_log WHERE org_id = ${user.orgId}::uuid
      `,
    ]);

    return NextResponse.json({
      ok: true,
      events: events.map(e => ({
        id: String(e.id),
        actorId: e.actor_id ? String(e.actor_id) : null,
        actorName: e.actor_name ? String(e.actor_name) : null,
        eventType: String(e.event_type),
        targetType: e.target_type ? String(e.target_type) : null,
        targetId: e.target_id ? String(e.target_id) : null,
        targetName: e.target_name ? String(e.target_name) : null,
        metadata: e.metadata ?? null,
        createdAt: new Date(String(e.created_at)).toISOString(),
      })),
      total: Number(countRow[0]?.total ?? 0),
      limit,
      offset,
      hasMore: offset + limit < Number(countRow[0]?.total ?? 0),
    });
  } catch (err) {
    console.error('[api/orgs/audit-log]', err);
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 });
  }
}
