/**
 * GET  /api/contacts/external  — list external contacts (personal + org-shared)
 * POST /api/contacts/external  — create a new external contact
 *
 * External contacts are people who are NOT on the LifeSync platform
 * (homeowners, adjusters, contractors, etc.).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const search  = searchParams.get('search') || '';
    const tag     = searchParams.get('tag') || '';
    const scope   = searchParams.get('scope') || 'all'; // 'personal' | 'org' | 'all'
    const limit   = Math.min(parseInt(searchParams.get('limit')  || '50', 10), 200);
    const offset  = parseInt(searchParams.get('offset') || '0', 10);

    const sql = neon(process.env.DATABASE_URL!);
    const pat = `%${search}%`;
    const orgId = user.orgId || null;

    const rows = await sql`
      SELECT
        id, org_id, owner_user_id, is_org_shared,
        name, phone, email, company, language, tags, notes,
        created_at, updated_at
      FROM external_contacts
      WHERE deleted_at IS NULL
        AND (
          owner_user_id = ${user.id}::uuid
          OR (
            is_org_shared = TRUE
            AND ${orgId}::uuid IS NOT NULL
            AND org_id = ${orgId}::uuid
          )
        )
        AND (
          ${scope} = 'all'
          OR (${scope} = 'personal' AND owner_user_id = ${user.id}::uuid AND is_org_shared = FALSE)
          OR (${scope} = 'org'      AND is_org_shared = TRUE)
        )
        AND (
          ${search} = ''
          OR name    ILIKE ${pat}
          OR phone   ILIKE ${pat}
          OR email   ILIKE ${pat}
          OR company ILIKE ${pat}
        )
        AND (
          ${tag} = ''
          OR ${tag} = ANY(tags)
        )
      ORDER BY
        CASE WHEN owner_user_id = ${user.id}::uuid AND is_org_shared = FALSE THEN 0 ELSE 1 END,
        name ASC
      LIMIT  ${limit}
      OFFSET ${offset}
    `;

    const countRow = await sql`
      SELECT COUNT(*) AS total
      FROM external_contacts
      WHERE deleted_at IS NULL
        AND (
          owner_user_id = ${user.id}::uuid
          OR (
            is_org_shared = TRUE
            AND ${orgId}::uuid IS NOT NULL
            AND org_id = ${orgId}::uuid
          )
        )
        AND (
          ${scope} = 'all'
          OR (${scope} = 'personal' AND owner_user_id = ${user.id}::uuid AND is_org_shared = FALSE)
          OR (${scope} = 'org'      AND is_org_shared = TRUE)
        )
        AND (
          ${search} = ''
          OR name    ILIKE ${pat}
          OR phone   ILIKE ${pat}
          OR email   ILIKE ${pat}
          OR company ILIKE ${pat}
        )
        AND (
          ${tag} = ''
          OR ${tag} = ANY(tags)
        )
    `;

    const contacts = rows.map((r: any) => ({
      id:           String(r.id),
      orgId:        r.org_id ? String(r.org_id) : null,
      ownerUserId:  String(r.owner_user_id),
      isOrgShared:  Boolean(r.is_org_shared),
      isOwner:      String(r.owner_user_id) === user.id,
      name:         String(r.name),
      phone:        r.phone  ? String(r.phone)  : null,
      email:        r.email  ? String(r.email)  : null,
      company:      r.company ? String(r.company) : null,
      language:     String(r.language ?? 'en'),
      tags:         (r.tags as string[]) ?? [],
      notes:        r.notes ? String(r.notes) : null,
      createdAt:    new Date(String(r.created_at)).toISOString(),
    }));

    return NextResponse.json({
      contacts,
      total:  parseInt(countRow[0]?.total || '0', 10),
      limit,
      offset,
    });
  } catch (err) {
    console.error('[external contacts GET]', err);
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const name      = String(body.name ?? '').trim();
    const phone     = body.phone     ? String(body.phone).trim()     : null;
    const email     = body.email     ? String(body.email).trim()     : null;
    const company   = body.company   ? String(body.company).trim()   : null;
    const language  = body.language  ? String(body.language)         : 'en';
    const tags      = Array.isArray(body.tags) ? body.tags.map(String) : [];
    const notes     = body.notes     ? String(body.notes).slice(0, 2000) : null;
    const isOrgShared = Boolean(body.isOrgShared) && !!user.orgId;

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!phone && !email) return NextResponse.json({ error: 'Phone or email is required' }, { status: 400 });

    const orgId = isOrgShared ? (user.orgId ?? null) : null;

    const sql = neon(process.env.DATABASE_URL!);

    const [created] = await sql`
      INSERT INTO external_contacts
        (org_id, owner_user_id, is_org_shared, name, phone, email, company, language, tags, notes)
      VALUES (
        ${orgId ? `${orgId}` : null}::uuid,
        ${user.id}::uuid,
        ${isOrgShared},
        ${name},
        ${phone},
        ${email},
        ${company},
        ${language},
        ${tags},
        ${notes}
      )
      RETURNING id, name, phone, email, company, language, tags, notes, is_org_shared, org_id, created_at
    `;

    return NextResponse.json({ ok: true, contact: {
      id:          String(created.id),
      name:        String(created.name),
      phone:       created.phone ? String(created.phone) : null,
      email:       created.email ? String(created.email) : null,
      company:     created.company ? String(created.company) : null,
      language:    String(created.language),
      tags:        (created.tags as string[]) ?? [],
      notes:       created.notes ? String(created.notes) : null,
      isOrgShared: Boolean(created.is_org_shared),
      orgId:       created.org_id ? String(created.org_id) : null,
      isOwner:     true,
      createdAt:   new Date(String(created.created_at)).toISOString(),
    }}, { status: 201 });
  } catch (err) {
    console.error('[external contacts POST]', err);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
}
