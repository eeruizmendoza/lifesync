/**
 * PATCH  /api/contacts/external/[id]  — update an external contact
 * DELETE /api/contacts/external/[id]  — soft-delete an external contact
 *
 * Only the owner or an org admin/owner can modify.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));

    const sql = neon(process.env.DATABASE_URL!);

    // Verify access: owner, or org admin/owner for shared contacts
    const [existing] = await sql`
      SELECT ec.*, om.role AS user_role
      FROM external_contacts ec
      LEFT JOIN org_members om
        ON om.org_id = ec.org_id AND om.user_id = ${user.id}::uuid
      WHERE ec.id = ${id}::uuid
        AND ec.deleted_at IS NULL
        AND (
          ec.owner_user_id = ${user.id}::uuid
          OR (ec.is_org_shared = TRUE AND om.role IN ('admin', 'owner'))
        )
    `;

    if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    const name       = body.name       !== undefined ? String(body.name).trim() : String(existing.name);
    const phone      = body.phone      !== undefined ? (body.phone ? String(body.phone).trim() : null) : existing.phone;
    const email      = body.email      !== undefined ? (body.email ? String(body.email).trim() : null) : existing.email;
    const company    = body.company    !== undefined ? (body.company ? String(body.company).trim() : null) : existing.company;
    const language   = body.language   !== undefined ? String(body.language) : String(existing.language);
    const tags       = body.tags       !== undefined ? (Array.isArray(body.tags) ? body.tags.map(String) : []) : (existing.tags ?? []);
    const notes      = body.notes      !== undefined ? (body.notes ? String(body.notes).slice(0, 2000) : null) : existing.notes;
    const isOrgShared = body.isOrgShared !== undefined
      ? (Boolean(body.isOrgShared) && !!user.orgId)
      : Boolean(existing.is_org_shared);

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const orgId = isOrgShared ? (user.orgId ?? existing.org_id) : null;

    const [updated] = await sql`
      UPDATE external_contacts
      SET
        name          = ${name},
        phone         = ${phone},
        email         = ${email},
        company       = ${company},
        language      = ${language},
        tags          = ${tags},
        notes         = ${notes},
        is_org_shared = ${isOrgShared},
        org_id        = ${orgId ? `${orgId}` : null}::uuid,
        updated_at    = NOW()
      WHERE id = ${id}::uuid
      RETURNING id, name, phone, email, company, language, tags, notes, is_org_shared, org_id, owner_user_id, updated_at
    `;

    return NextResponse.json({ ok: true, contact: {
      id:          String(updated.id),
      name:        String(updated.name),
      phone:       updated.phone ? String(updated.phone) : null,
      email:       updated.email ? String(updated.email) : null,
      company:     updated.company ? String(updated.company) : null,
      language:    String(updated.language),
      tags:        (updated.tags as string[]) ?? [],
      notes:       updated.notes ? String(updated.notes) : null,
      isOrgShared: Boolean(updated.is_org_shared),
      orgId:       updated.org_id ? String(updated.org_id) : null,
      isOwner:     String(updated.owner_user_id) === user.id,
    }});
  } catch (err) {
    console.error('[external contacts PATCH]', err);
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const sql = neon(process.env.DATABASE_URL!);

    // Verify access: owner or org admin/owner
    const [existing] = await sql`
      SELECT ec.id, om.role AS user_role
      FROM external_contacts ec
      LEFT JOIN org_members om
        ON om.org_id = ec.org_id AND om.user_id = ${user.id}::uuid
      WHERE ec.id = ${id}::uuid
        AND ec.deleted_at IS NULL
        AND (
          ec.owner_user_id = ${user.id}::uuid
          OR (ec.is_org_shared = TRUE AND om.role IN ('admin', 'owner'))
        )
    `;

    if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    await sql`
      UPDATE external_contacts
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id}::uuid
    `;

    return NextResponse.json({ ok: true, deletedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[external contacts DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
  }
}
