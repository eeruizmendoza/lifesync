/**
 * POST /api/webhooks/test/[id]
 * Sends a test ping event to the webhook endpoint so the user can verify
 * their server is receiving and verifying signatures correctly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { deliverWebhookEvent } from '@/lib/webhook-service';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const { id } = await context.params;
    const sql = neon(process.env.DATABASE_URL!);

    // Verify endpoint belongs to this org
    const [endpoint] = await sql`
      SELECT id FROM webhook_endpoints
      WHERE id = ${id}::uuid AND org_id = ${user.orgId}::uuid
    `;
    if (!endpoint) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Temporarily force-include this endpoint for the ping event by delivering directly
    await deliverWebhookEvent(user.orgId, 'ping', {
      message: 'This is a test ping from LifeSync.',
      triggeredBy: user.id,
      endpointId: id,
    });

    return NextResponse.json({ ok: true, message: 'Test ping sent. Check your server logs.' });
  } catch (err) {
    console.error('[api/webhooks/test POST]', err);
    return NextResponse.json({ error: 'Failed to send test ping' }, { status: 500 });
  }
}
