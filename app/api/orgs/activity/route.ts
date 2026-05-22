/**
 * GET /api/orgs/activity
 * Recent activity feed for the organization.
 * Returns last 20 events: calls, member joins, invites sent.
 *
 * Response:
 * { ok, events: ActivityEvent[] }
 *
 * ActivityEvent:
 *   { id, type: 'call'|'member_joined'|'invite_sent', label, sublabel, ts }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const orgId = user.orgId;

    // Fetch all three event sources in parallel, union them in JS for simplicity
    const [calls, memberJoins, invites] = await Promise.all([
      // Recent calls
      sql`
        SELECT
          c.id::text AS id,
          'call' AS type,
          u.name AS caller_name,
          u.phone_number AS caller_phone,
          c.language_pair,
          c.conversation_type,
          c.duration_seconds,
          c.created_at
        FROM conversations c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.org_id = ${orgId}::uuid
          AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
        LIMIT 10
      `,

      // Recent member joins
      sql`
        SELECT
          om.id::text AS id,
          'member_joined' AS type,
          u.name,
          u.phone_number,
          u.email,
          om.role,
          om.joined_at AS created_at
        FROM organization_members om
        JOIN users u ON u.id = om.user_id
        WHERE om.org_id = ${orgId}::uuid
        ORDER BY om.joined_at DESC
        LIMIT 5
      `,

      // Recent invites sent
      sql`
        SELECT
          id::text,
          'invite_sent' AS type,
          email,
          role,
          created_at
        FROM organization_invites
        WHERE org_id = ${orgId}::uuid
        ORDER BY created_at DESC
        LIMIT 5
      `,
    ]);

    // Normalize into unified activity events
    type ActivityEvent = {
      id: string;
      type: string;
      label: string;
      sublabel: string;
      ts: string;
    };

    const events: ActivityEvent[] = [];

    for (const row of calls as Array<Record<string, unknown>>) {
      const callerLabel = (row.caller_name as string | null) ?? (row.caller_phone as string | null) ?? 'Unknown';
      const pair = (row.language_pair as string | null) ?? 'Unknown language pair';
      const durSec = Number(row.duration_seconds ?? 0);
      const durLabel = durSec >= 60
        ? `${Math.floor(durSec / 60)}m ${durSec % 60}s`
        : durSec > 0 ? `${durSec}s` : 'No duration';
      const callKind = (row.conversation_type as string) === 'video_call' ? 'Video call' : 'Phone call';
      events.push({
        id: `call-${row.id as string}`,
        type: 'call',
        label: `${callKind} — ${pair}`,
        sublabel: `${callerLabel} · ${durLabel}`,
        ts: new Date(row.created_at as string).toISOString(),
      });
    }

    for (const row of memberJoins as Array<Record<string, unknown>>) {
      const memberLabel = (row.name as string | null) ?? (row.email as string | null) ?? (row.phone_number as string | null) ?? 'New member';
      events.push({
        id: `join-${row.id as string}`,
        type: 'member_joined',
        label: `${memberLabel} joined`,
        sublabel: `Role: ${row.role as string}`,
        ts: new Date(row.created_at as string).toISOString(),
      });
    }

    for (const row of invites as Array<Record<string, unknown>>) {
      events.push({
        id: `invite-${row.id as string}`,
        type: 'invite_sent',
        label: `Invite sent to ${row.email as string}`,
        sublabel: `Role: ${row.role as string}`,
        ts: new Date(row.created_at as string).toISOString(),
      });
    }

    // Sort all events by most recent
    events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    return NextResponse.json({ ok: true, events: events.slice(0, 20) });
  } catch (err) {
    console.error('[orgs/activity]', err);
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 });
  }
}
