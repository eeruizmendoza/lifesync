/**
 * GET /api/users/contacts/[id]
 * Returns a contact's profile plus the last 20 calls shared between
 * the authenticated user and this contact.
 *
 * Response:
 * {
 *   ok: boolean,
 *   contact: { id, name, phone, email, language, lastSeenAt, avatarUrl },
 *   calls: CallRecord[],
 *   totalCalls: number,
 *   totalMinutes: number,
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: contactId } = await context.params;
    if (!contactId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);

    // Fetch contact profile
    const [contact] = await sql`
      SELECT
        id,
        name,
        phone_number AS phone,
        email,
        avatar_url,
        language_preference AS language,
        last_seen_at
      FROM users
      WHERE id = ${contactId}::uuid
        AND (private IS NULL OR private = false)
    `;

    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    // Fetch calls between authenticated user and this contact
    const calls = await sql`
      SELECT
        id,
        conversation_type AS type,
        user_language,
        contact_language,
        language_pair,
        duration_seconds,
        contact_phone,
        created_at
      FROM conversations
      WHERE deleted_at IS NULL
        AND (
          (user_id = ${user.id}::uuid AND contact_id = ${contactId}::uuid)
          OR
          (user_id = ${contactId}::uuid AND contact_id = ${user.id}::uuid)
        )
      ORDER BY created_at DESC
      LIMIT 20
    `;

    // Stats
    const statsRow = await sql`
      SELECT
        COUNT(*)::int AS total_calls,
        COALESCE(SUM(duration_seconds), 0)::int AS total_seconds
      FROM conversations
      WHERE deleted_at IS NULL
        AND (
          (user_id = ${user.id}::uuid AND contact_id = ${contactId}::uuid)
          OR
          (user_id = ${contactId}::uuid AND contact_id = ${user.id}::uuid)
        )
    `;

    return NextResponse.json({
      ok: true,
      contact: {
        id: String(contact.id),
        name: contact.name ? String(contact.name) : null,
        phone: contact.phone ? String(contact.phone) : null,
        email: contact.email ? String(contact.email) : null,
        language: contact.language ? String(contact.language) : null,
        avatarUrl: contact.avatar_url ? String(contact.avatar_url) : null,
        lastSeenAt: contact.last_seen_at ? new Date(String(contact.last_seen_at)).toISOString() : null,
      },
      calls: calls.map(c => ({
        id: String(c.id),
        type: String(c.type),
        userLanguage: String(c.user_language ?? ''),
        contactLanguage: String(c.contact_language ?? ''),
        languagePair: String(c.language_pair ?? ''),
        durationSeconds: Number(c.duration_seconds ?? 0),
        createdAt: new Date(String(c.created_at)).toISOString(),
      })),
      totalCalls: statsRow[0]?.total_calls ?? 0,
      totalMinutes: Math.round((statsRow[0]?.total_seconds ?? 0) / 60),
    });
  } catch (err) {
    console.error('[contacts/[id]]', err);
    return NextResponse.json({ error: 'Failed to load contact' }, { status: 500 });
  }
}
