/**
 * PATCH  /api/webhooks/[id]  — update (enable/disable, change events)
 * DELETE /api/webhooks/[id]  — delete endpoint permanently
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { requireAdminRole } from '@/lib/tenant-middleware';

export const dynamic = 'force-dynamic';

const VALID_EVENTS = new Set([
  'call.completed',
  'call.missed',
  'recording.ready',
  'member.joined',
  'quota.warning',
]);

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });
    const roleErrP = await requireAdminRole(user);
    if (roleErrP) return roleErrP;

    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { isActive, events, description } = body as {
      isActive?: boolean;
      events?: string[];
      description?: string;
    };

    const sql = neon(process.env.DATABASE_URL!);

    // Verify ownership
    const [existing] = await sql`
      SELECT id FROM webhook_endpoints
      WHERE id = ${id}::uuid AND org_id = ${user.orgId}::uuid
    `;
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (events !== undefined) {
      const invalid = events.filter(e => !VALID_EVENTS.has(e));
      if (invalid.length > 0) {
        return NextResponse.json({ error: `Invalid event types: ${invalid.join(', ')}` }, { status: 400 });
      }
    }

    const updates: string[] = [];
    if (isActive !== undefined) updates.push(`is_active = ${isActive ? 'TRUE' : 'FALSE'}`);
    if (description !== undefined) updates.push(`description = ${description ? `'${description.replace(/'/g, "''")}'` : 'NULL'}`);
    if (events !== undefined) {
      const evStr = events.map(e => `'${e}'`).join(',');
      updates.push(`events = ARRAY[${evStr}]::text[]`);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const [updated] = await sql.unsafe(`
      UPDATE webhook_endpoints SET ${updates.join(', ')}
      WHERE id = '${id}' AND org_id = '${user.orgId}'
      RETURNING id, url, description, events, is_active, failure_count, last_triggered_at, created_at
    `);

    return NextResponse.json({ ok: true, endpoint: {
      id: String(updated.id),
      url: String(updated.url),
      description: updated.description ? String(updated.description) : null,
      events: (updated.events as string[]) ?? [],
      isActive: Boolean(updated.is_active),
      failureCount: Number(updated.failure_count ?? 0),
      lastTriggeredAt: updated.last_triggered_at ? new Date(String(updated.last_triggered_at)).toISOString() : null,
      createdAt: new Date(String(updated.created_at)).toISOString(),
    }});
  } catch (err) {
    console.error('[api/webhooks PATCH]', err);
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });
    const roleErrD = await requireAdminRole(user);
    if (roleErrD) return roleErrD;

    const { id } = await context.params;
    const sql = neon(process.env.DATABASE_URL!);

    const result = await sql`
      DELETE FROM webhook_endpoints
      WHERE id = ${id}::uuid AND org_id = ${user.orgId}::uuid
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (err) {
    console.error('[api/webhooks DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
  }
}
