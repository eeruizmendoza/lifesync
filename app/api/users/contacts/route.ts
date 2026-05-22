/**
 * GET /api/users/contacts
 * Returns a list of users that the authenticated user can call.
 * Excludes the requesting user from the list.
 *
 * Query params:
 *   search  - optional text filter on name, email, or phone
 *   tag     - optional tag filter (e.g. "Adjuster", "Contractor")
 *   limit   - default 50
 *   offset  - default 0
 *
 * Response:
 *   { contacts: Contact[], total: number }
 *   Contact includes: id, name, phone, email, avatar, language,
 *                     isOnline, isRecent, lastSeenAt, tags, company
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const tag = searchParams.get('tag') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const sql = neon(process.env.DATABASE_URL!);

    const searchPattern = `%${search}%`;

    const rows = await sql`
      SELECT
        u.id,
        u.name,
        u.phone_number AS phone,
        u.email,
        u.avatar_url AS avatar,
        u.language_preference AS language,
        u.last_seen_at,
        COALESCE(c.tags, '{}') AS tags,
        c.company
      FROM users u
      LEFT JOIN contacts c
        ON c.user_id = ${user.id}::uuid
        AND c.contact_user_id = u.id
      WHERE
        u.id::text != ${user.id}
        AND (u.private IS NULL OR u.private = false)
        AND (
          ${search} = ''
          OR u.name ILIKE ${searchPattern}
          OR u.email ILIKE ${searchPattern}
          OR u.phone_number ILIKE ${searchPattern}
        )
        AND (
          ${tag} = ''
          OR ${tag} = ANY(COALESCE(c.tags, '{}'::text[]))
        )
      ORDER BY u.last_seen_at DESC NULLS LAST, u.name ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const countRow = await sql`
      SELECT COUNT(*) AS total
      FROM users u
      LEFT JOIN contacts c
        ON c.user_id = ${user.id}::uuid
        AND c.contact_user_id = u.id
      WHERE
        u.id::text != ${user.id}
        AND (u.private IS NULL OR u.private = false)
        AND (
          ${search} = ''
          OR u.name ILIKE ${searchPattern}
          OR u.email ILIKE ${searchPattern}
          OR u.phone_number ILIKE ${searchPattern}
        )
        AND (
          ${tag} = ''
          OR ${tag} = ANY(COALESCE(c.tags, '{}'::text[]))
        )
    `;

    const now = Date.now();
    const contacts = rows.map((r: any) => {
      const lastSeen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : null;
      const secondsAgo = lastSeen ? Math.floor((now - lastSeen) / 1000) : null;
      const isOnline = secondsAgo !== null && secondsAgo < 90;           // seen in last 90s
      const isRecent = secondsAgo !== null && secondsAgo < 3600 * 4;    // seen in last 4h
      return {
        id: String(r.id),
        name: r.name || r.email?.split('@')[0] || 'Unknown',
        phone: r.phone || '',
        email: r.email || '',
        avatar: r.avatar || null,
        language: r.language || 'en',
        isOnline,
        isRecent,
        lastSeenAt: lastSeen,
        tags: (r.tags as string[]) ?? [],
        company: r.company ? String(r.company) : null,
      };
    });

    return NextResponse.json({
      contacts,
      total: parseInt(countRow[0]?.total || '0', 10),
      limit,
      offset,
    });
  } catch (error) {
    console.error('Failed to fetch contacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
