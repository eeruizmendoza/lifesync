/**
 * GET /api/users/contacts
 * Returns a list of users that the authenticated user can call.
 * Excludes the requesting user from the list.
 *
 * Query params:
 *   search  - optional text filter on name, email, or phone
 *   limit   - default 50
 *   offset  - default 0
 *
 * Response:
 *   { contacts: Contact[], total: number }
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const sql = neon(process.env.DATABASE_URL!);

    const searchPattern = `%${search}%`;

    const rows = await sql`
      SELECT
        id,
        name,
        phone_number AS phone,
        email,
        avatar_url AS avatar,
        language_preference AS language,
        CASE WHEN private THEN false ELSE true END AS is_visible
      FROM users
      WHERE
        id::text != ${user.id}
        AND (private IS NULL OR private = false)
        AND (
          ${search} = ''
          OR name ILIKE ${searchPattern}
          OR email ILIKE ${searchPattern}
          OR phone_number ILIKE ${searchPattern}
        )
      ORDER BY name ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const countRow = await sql`
      SELECT COUNT(*) AS total
      FROM users
      WHERE
        id::text != ${user.id}
        AND (private IS NULL OR private = false)
        AND (
          ${search} = ''
          OR name ILIKE ${searchPattern}
          OR email ILIKE ${searchPattern}
          OR phone_number ILIKE ${searchPattern}
        )
    `;

    const contacts = rows.map((r: any) => ({
      id: r.id,
      name: r.name || r.email?.split('@')[0] || 'Unknown',
      phone: r.phone || '',
      email: r.email || '',
      avatar: r.avatar || null,
      language: r.language || 'en',
      isOnline: false, // real-time presence is a future feature
    }));

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
