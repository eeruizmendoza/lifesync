/**
 * PATCH /api/calls/[id]/followup
 * Set or clear a follow-up reminder date on a call.
 * When the date passes, a daily job fires a notification.
 *
 * Body:    { followUpAt: string (ISO) | null }
 * Returns: { ok, followUpAt }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: callId } = await context.params;
    if (!callId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const rawDate: string | null = body.followUpAt ?? null;

    // Validate and parse the date
    let followUpAt: Date | null = null;
    if (rawDate) {
      followUpAt = new Date(rawDate);
      if (isNaN(followUpAt.getTime())) {
        return NextResponse.json({ error: 'Invalid followUpAt date' }, { status: 400 });
      }
      // Must be in the future
      if (followUpAt.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Follow-up date must be in the future' }, { status: 400 });
      }
      // Max 1 year out
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 1);
      if (followUpAt > maxDate) {
        return NextResponse.json({ error: 'Follow-up date too far in the future (max 1 year)' }, { status: 400 });
      }
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Verify ownership
    const [conv] = await sql`
      SELECT id FROM conversations
      WHERE id = ${callId}::uuid
        AND deleted_at IS NULL
        AND (user_id = ${user.id}::uuid OR contact_id = ${user.id}::uuid)
    `;
    if (!conv) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

    await sql`
      UPDATE conversations
      SET follow_up_at   = ${followUpAt ? followUpAt.toISOString() : null},
          follow_up_sent = ${followUpAt ? false : false},
          updated_at     = NOW()
      WHERE id = ${callId}::uuid
    `;

    return NextResponse.json({
      ok: true,
      followUpAt: followUpAt ? followUpAt.toISOString() : null,
    });
  } catch (err) {
    console.error('[calls/[id]/followup PATCH]', err);
    return NextResponse.json({ error: 'Failed to set follow-up' }, { status: 500 });
  }
}
