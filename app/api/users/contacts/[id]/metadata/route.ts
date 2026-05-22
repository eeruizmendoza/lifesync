/**
 * PATCH /api/users/contacts/[id]/metadata
 * Upsert per-user metadata for a contact: tags, notes, company.
 * Creates a row in `contacts` table if one doesn't exist yet.
 *
 * Body: { tags?: string[], notes?: string | null, company?: string | null }
 * Response: { ok, tags, notes, company }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const PREDEFINED_TAGS = [
  'Adjuster', 'Homeowner', 'Contractor', 'Subcontractor',
  'Insurance', 'Supplier', 'Property Manager', 'Other',
];

export async function PATCH(
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
    const { tags, notes, company } = body as {
      tags?: string[];
      notes?: string | null;
      company?: string | null;
    };

    // Validate tags
    if (tags !== undefined) {
      if (!Array.isArray(tags) || tags.length > 10) {
        return NextResponse.json({ error: 'tags must be an array of up to 10 strings' }, { status: 400 });
      }
      // Allow predefined tags + custom (max 40 chars each)
      const invalid = tags.filter(t => typeof t !== 'string' || t.length > 40);
      if (invalid.length > 0) {
        return NextResponse.json({ error: 'Each tag must be a string under 40 characters' }, { status: 400 });
      }
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Verify the target user exists
    const [targetUser] = await sql`SELECT id FROM users WHERE id = ${contactUserId}::uuid LIMIT 1`;
    if (!targetUser) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    // Upsert into contacts table
    const [result] = await sql`
      INSERT INTO contacts (user_id, contact_user_id, tags, notes, company, updated_at)
      VALUES (${user.id}::uuid, ${contactUserId}::uuid,
              ${sql.array(tags ?? [], 'text')},
              ${notes ?? null},
              ${company?.trim() ?? null},
              NOW())
      ON CONFLICT (user_id, contact_user_id)
        DO UPDATE SET
          tags       = CASE WHEN ${tags !== undefined} THEN EXCLUDED.tags       ELSE contacts.tags       END,
          notes      = CASE WHEN ${notes !== undefined} THEN EXCLUDED.notes     ELSE contacts.notes      END,
          company    = CASE WHEN ${company !== undefined} THEN EXCLUDED.company  ELSE contacts.company    END,
          updated_at = NOW()
      RETURNING tags, notes, company
    `;

    return NextResponse.json({
      ok: true,
      tags: (result?.tags as string[]) ?? [],
      notes: result?.notes ? String(result.notes) : null,
      company: result?.company ? String(result.company) : null,
    });
  } catch (err) {
    console.error('[contacts/[id]/metadata PATCH]', err);
    return NextResponse.json({ error: 'Failed to update contact metadata' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: contactUserId } = await context.params;
    const sql = neon(process.env.DATABASE_URL!);

    const [row] = await sql`
      SELECT tags, notes, company FROM contacts
      WHERE user_id = ${user.id}::uuid AND contact_user_id = ${contactUserId}::uuid
    `;

    return NextResponse.json({
      ok: true,
      tags: (row?.tags as string[]) ?? [],
      notes: row?.notes ? String(row.notes) : null,
      company: row?.company ? String(row.company) : null,
      predefinedTags: PREDEFINED_TAGS,
    });
  } catch (err) {
    console.error('[contacts/[id]/metadata GET]', err);
    return NextResponse.json({ error: 'Failed to load metadata' }, { status: 500 });
  }
}
