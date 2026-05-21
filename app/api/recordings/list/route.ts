/**
 * GET /api/recordings/list?conversationId={id}
 * List all recordings for a conversation
 *
 * Query parameters:
 * - conversationId: string (UUID)
 * - limit: number (default 20)
 * - offset: number (default 0)
 *
 * Response:
 * {
 *   recordings: Array<{
 *     id: string
 *     conversationId: string
 *     recordingType: 'audio' | 'video'
 *     fileSizeBytes: number
 *     durationSeconds: number
 *     createdAt: string
 *   }>
 *   total: number
 *   limit: number
 *   offset: number
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Max 100
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Missing conversationId' },
        { status: 400 }
      );
    }

    // Verify user has access to this conversation
    const conversationCheck = await sql`
      SELECT id, user_id, contact_id
      FROM conversations
      WHERE id = $1
      LIMIT 1
    `;

    if (!conversationCheck.rows.length) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const conversation = conversationCheck.rows[0];

    // Verify access (owner or contact)
    if (conversation.user_id !== user.id && conversation.contact_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get total count
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM conversation_recordings
      WHERE conversation_id = $1 AND deleted_at IS NULL
    `;

    const total = parseInt(countResult.rows[0].total);

    // Get recordings for this conversation
    const recordingsQuery = await sql`
      SELECT
        id,
        conversation_id,
        recording_type,
        mime_type,
        file_size_bytes,
        duration_seconds,
        created_at,
        processing_status,
        transcription_status
      FROM conversation_recordings
      WHERE conversation_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const recordings = recordingsQuery.rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      recordingType: row.recording_type,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes,
      durationSeconds: row.duration_seconds,
      createdAt: row.created_at,
      processingStatus: row.processing_status,
      transcriptionStatus: row.transcription_status,
    }));

    return NextResponse.json({
      recordings,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('List recordings error:', error);
    return NextResponse.json(
      {
        error: 'Failed to list recordings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recordings/list
 * Batch get metadata for multiple recordings
 *
 * Request body:
 * {
 *   recordingIds: string[] (array of UUIDs)
 * }
 *
 * Response:
 * {
 *   recordings: Array<recording metadata>
 *   notFound: string[] (ids that weren't found)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await request.json();
    const { recordingIds } = body;

    if (!Array.isArray(recordingIds) || recordingIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid recordingIds' },
        { status: 400 }
      );
    }

    // Get recordings with access control
    const recordingsQuery = await sql`
      SELECT
        cr.id,
        cr.conversation_id,
        cr.recording_type,
        cr.mime_type,
        cr.file_size_bytes,
        cr.duration_seconds,
        cr.created_at,
        c.user_id,
        c.contact_id
      FROM conversation_recordings cr
      JOIN conversations c ON cr.conversation_id = c.id
      WHERE cr.id = ANY($1::uuid[]) AND cr.deleted_at IS NULL
    `;

    const recordings = recordingsQuery.rows
      .filter(row => {
        // Only return if user has access
        return row.user_id === user.id || row.contact_id === user.id;
      })
      .map(row => ({
        id: row.id,
        conversationId: row.conversation_id,
        recordingType: row.recording_type,
        mimeType: row.mime_type,
        fileSizeBytes: row.file_size_bytes,
        durationSeconds: row.duration_seconds,
        createdAt: row.created_at,
      }));

    // Find which IDs weren't found or weren't accessible
    const foundIds = new Set(recordings.map(r => r.id));
    const notFound = recordingIds.filter(id => !foundIds.has(id));

    return NextResponse.json({
      recordings,
      notFound,
    });
  } catch (error) {
    console.error('Batch get recordings error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get recordings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
