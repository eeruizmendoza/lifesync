/**
 * PATCH /api/calls/[id]/notes
 * Save (or clear) free-text notes on a conversation.
 * Only the caller or the contact of the conversation may write notes.
 *
 * Body:    { notes: string | null }
 * Returns: { ok, notes }
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
    const notes: string | null = typeof body.notes === 'string'
      ? body.notes.trim().slice(0, 4000) || null   // max 4000 chars, empty → null
      : null;

    const sql = neon(process.env.DATABASE_URL!);

    // Verify the conversation belongs to the current user (caller or contact)
    const [conv] = await sql`
      SELECT id FROM conversations
      WHERE id = ${callId}::uuid
        AND deleted_at IS NULL
        AND (user_id = ${user.id}::uuid OR contact_id = ${user.id}::uuid)
    `;

    if (!conv) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

    // Update notes
    await sql`
      UPDATE conversations
      SET notes = ${notes}, updated_at = NOW()
      WHERE id = ${callId}::uuid
    `;

    return NextResponse.json({ ok: true, notes });
  } catch (err) {
    console.error('[calls/[id]/notes PATCH]', err);
    return NextResponse.json({ error: 'Failed to save notes' }, { status: 500 });
  }
}
