/**
 * POST /api/users/contacts/[id]/pin
 * Toggle the is_pinned flag for a contact.
 * Creates the contacts row if it doesn't exist yet.
 *
 * Body:    { pinned: boolean }
 * Returns: { ok, isPinned }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: contactUserId } = await context.params;
    if (!contactUserId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const isPinned: boolean = body.pinned === true;

    const sql = neon(process.env.DATABASE_URL!);

    // Verify the target user exists
    const [targetUser] = await sql`SELECT id FROM users WHERE id = ${contactUserId}::uuid LIMIT 1`;
    if (!targetUser) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    // Upsert: create row if needed, then set is_pinned
    await sql`
      INSERT INTO contacts (user_id, contact_user_id, is_pinned, updated_at)
      VALUES (${user.id}::uuid, ${contactUserId}::uuid, ${isPinned}, NOW())
      ON CONFLICT (user_id, contact_user_id)
        DO UPDATE SET is_pinned = ${isPinned}, updated_at = NOW()
    `;

    return NextResponse.json({ ok: true, isPinned });
  } catch (err) {
    console.error('[contacts/[id]/pin POST]', err);
    return NextResponse.json({ error: 'Failed to update pin status' }, { status: 500 });
  }
}
