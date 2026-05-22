/**
 * DELETE /api/recordings/[recordingId]/delete
 * Soft-delete a recording (marks deleted_at timestamp).
 * Physical S3 deletion happens via the daily cleanup cron after 30 days.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { deleteRecordingLogical, getRecordingById } from '@/lib/database/recordings';
import { logRecordingAccess } from '@/lib/database/recordings';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ recordingId: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { recordingId } = await params;

    // Verify the recording exists and belongs to this user
    const recording = await getRecordingById(recordingId, user.id);
    if (!recording) {
      return NextResponse.json(
        { error: 'Recording not found or access denied' },
        { status: 404 }
      );
    }

    // Soft-delete
    const deleted = await deleteRecordingLogical(recordingId, user.id);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete recording' },
        { status: 500 }
      );
    }

    // Audit log
    try {
      await logRecordingAccess(
        recordingId,
        user.id,
        'delete',
        request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '',
        request.headers.get('user-agent') ?? ''
      );
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      ok: true,
      deletedAt: new Date().toISOString(),
      message: 'Recording deleted. Physical storage will be purged after 30 days.',
    });
  } catch (error) {
    console.error('Failed to delete recording:', error);
    return NextResponse.json(
      { error: 'Failed to delete recording', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
