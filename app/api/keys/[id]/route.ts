/**
 * DELETE /api/keys/[id]
 * Revoke (soft-delete) an API key. Only the key owner org's admin can revoke.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { requireAdminRole } from '@/lib/tenant-middleware';
import { logAuditEvent } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });
    const roleErr = await requireAdminRole(user);
    if (roleErr) return roleErr;

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);

    const result = await sql`
      UPDATE api_keys
      SET revoked_at = NOW()
      WHERE id = ${id}::uuid
        AND org_id = ${user.orgId}::uuid
        AND revoked_at IS NULL
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Key not found or already revoked' }, { status: 404 });
    }

    // Audit log
    logAuditEvent({
      orgId: user.orgId,
      actorId: user.id,
      eventType: 'api_key.revoked',
      targetType: 'api_key',
      targetId: id,
    }).catch(() => {});

    return NextResponse.json({ ok: true, revokedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[api/keys DELETE]', err);
    return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 });
  }
}
