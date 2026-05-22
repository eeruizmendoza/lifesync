/**
 * GET  /api/notifications — list recent notifications for current user
 * POST /api/notifications/read — mark one or all as read
 *
 * Query params (GET):
 *   limit  (default 20, max 50)
 *   unread (= "1" to fetch only unread)
 *
 * Response:
 *   { notifications: NotificationItem[], unreadCount: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export interface NotificationItem {
  id: string;
  type: 'missed_call' | 'member_joined' | 'quota_warning' | 'system';
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/* ── GET ─────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limitRaw = parseInt(searchParams.get('limit') ?? '20');
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 20 : limitRaw), 50);
    const unreadOnly = searchParams.get('unread') === '1';

    const sql = neon(process.env.DATABASE_URL!);

    const rows = await sql`
      SELECT
        id,
        type,
        title,
        body,
        link,
        read_at,
        created_at
      FROM user_notifications
      WHERE user_id = ${user.id}::uuid
        ${unreadOnly ? sql`AND read_at IS NULL` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    // Separate query for unread count (always up-to-date regardless of filter)
    const countRow = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM user_notifications
      WHERE user_id = ${user.id}::uuid
        AND read_at IS NULL
    `;

    const notifications: NotificationItem[] = rows.map(r => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body ?? null,
      link: r.link ?? null,
      readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      notifications,
      unreadCount: countRow[0]?.cnt ?? 0,
    });
  } catch (err) {
    console.error('[notifications GET]', err);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }
}

/* ── PATCH — mark one or all as read ─────────────────────────────── */

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { id, all } = body as { id?: string; all?: boolean };

    const sql = neon(process.env.DATABASE_URL!);

    if (all) {
      await sql`
        UPDATE user_notifications
        SET read_at = NOW()
        WHERE user_id = ${user.id}::uuid
          AND read_at IS NULL
      `;
    } else if (id) {
      await sql`
        UPDATE user_notifications
        SET read_at = NOW()
        WHERE id = ${id}::uuid
          AND user_id = ${user.id}::uuid
      `;
    } else {
      return NextResponse.json({ error: 'Provide id or all:true' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notifications PATCH]', err);
    return NextResponse.json({ error: 'Failed to mark notifications' }, { status: 500 });
  }
}
