/**
 * GET /api/recordings/list?conversationId={id}
 * List all recordings for a conversation with pagination
 * Phase 5: Recording, Encryption & Storage
 *
 * Query parameters:
 * - conversationId: string (UUID) - required
 * - limit: number (default 20, max 100)
 * - offset: number (default 0)
 *
 * Response:
 * {
 *   recordings: Array<{
 *     id: string
 *     conversationId: string
 *     recordingType: 'audio' | 'video' | 'screen_share'
 *     mimeType: string
 *     fileSizeBytes: number
 *     durationSeconds: number
 *     processingStatus: 'pending' | 'processing' | 'complete' | 'failed'
 *     transcriptionStatus: 'pending' | 'processing' | 'complete' | 'failed'
 *     createdAt: string (ISO timestamp)
 *   }>
 *   total: number
 *   limit: number
 *   offset: number
 *   hasMore: boolean
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { listUserRecordings } from '@/lib/database/recordings';

export async function GET(request: NextRequest) {
  try {
    // 1. Verify JWT auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse query parameters
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Max 100
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Missing conversationId query parameter' },
        { status: 400 }
      );
    }

    // 3. List user's recordings with pagination
    const { recordings, total } = await listUserRecordings(
      user.id,
      conversationId,
      limit,
      offset
    );

    console.log(`📋 Listed recordings: ${recordings.length}/${total} for conversation ${conversationId}`);

    return NextResponse.json({
      recordings,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('Failed to list recordings:', error);
    return NextResponse.json(
      {
        error: 'Failed to list recordings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

