/**
 * GET /api/calls/history
 * List call history for the current user (phone calls + video calls).
 * Paginated via ?limit=&offset=
 * Optionally filter by ?type=phone_call|video_call
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const typeFilter = searchParams.get('type'); // 'phone_call' | 'video_call' | null (all)

    // Build WHERE clause
    const typeCondition =
      typeFilter === 'phone_call' || typeFilter === 'video_call'
        ? `AND c.conversation_type = '${typeFilter}'`
        : "AND c.conversation_type IN ('phone_call', 'video_call')";

    const orgCondition = user.orgId ? `AND c.org_id = '${user.orgId}'` : '';

    const countResult = await db.query(
      `SELECT COUNT(*) AS total
       FROM conversations c
       WHERE c.user_id = $1::uuid
         AND c.deleted_at IS NULL
         ${typeCondition}
         ${orgCondition}`,
      [user.id]
    );

    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    const result = await db.query(
      `SELECT
          c.id,
          c.conversation_type,
          c.user_language,
          c.contact_language,
          c.language_pair,
          c.duration_seconds,
          c.contact_phone,
          c.created_at,
          c.updated_at,
          -- Join contact user details if they're in the system
          u.name    AS contact_name,
          u.phone_number AS contact_phone_number
       FROM conversations c
       LEFT JOIN users u ON u.id = c.contact_id
       WHERE c.user_id = $1::uuid
         AND c.deleted_at IS NULL
         ${typeCondition}
         ${orgCondition}
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [user.id, limit, offset]
    );

    const calls = result.rows.map(row => ({
      id: String(row.id),
      type: String(row.conversation_type),
      userLanguage: String(row.user_language),
      contactLanguage: String(row.contact_language),
      languagePair: String(row.language_pair),
      durationSeconds: Number(row.duration_seconds ?? 0),
      contactPhone: row.contact_phone ? String(row.contact_phone) : (row.contact_phone_number ? String(row.contact_phone_number) : null),
      contactName: row.contact_name ? String(row.contact_name) : null,
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    }));

    return NextResponse.json({
      calls,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('[calls/history]', error);
    return NextResponse.json(
      { error: 'Failed to fetch call history', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
