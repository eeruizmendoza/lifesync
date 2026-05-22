/**
 * GET /api/recordings
 * List all recordings for the current user across all conversations.
 * Supports pagination via ?limit=&offset=
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getAllUserRecordings } from '@/lib/database/recordings';

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

    const { recordings, total } = await getAllUserRecordings(
      user.id,
      user.orgId ?? null,
      limit,
      offset
    );

    return NextResponse.json({
      recordings,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('Failed to list all recordings:', error);
    return NextResponse.json(
      { error: 'Failed to list recordings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
