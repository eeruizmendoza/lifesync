/**
 * POST /api/jobs/cleanup-recordings
 * CRON job: Delete S3 files for recordings soft-deleted > 30 days ago
 * Phase 5: Recording, Encryption & Storage
 *
 * Schedule: Daily at 2:00 AM UTC (configured in vercel.json)
 *
 * Flow:
 *  1. Find all recordings with deleted_at < NOW() - 30 days
 *  2. Delete each from S3
 *  3. Mark is_deleted_permanently = true in DB
 *  4. Clean up orphaned keys from call_recording_encryption_keys
 *  5. Return summary
 *
 * GET handler: Returns count of recordings pending permanent deletion
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteRecordingFromS3 } from '@/lib/s3-service';
import { db } from '@/lib/db';

const RETENTION_DAYS = 30; // Days to keep soft-deleted recordings before permanent S3 purge

export async function POST(request: NextRequest) {
  const jobStart = Date.now();
  let purgedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  try {
    // 1. Verify cron secret
    const secret = request.headers.get('x-cron-secret')
      || request.headers.get('authorization')?.replace('Bearer ', '');

    if (secret !== process.env.RESEARCH_PIPELINE_CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`🧹 Cleanup job started: ${new Date().toISOString()}`);

    // 2. Find recordings ready for permanent deletion (deleted > 30 days ago)
    const staleResult = await db.query(
      `SELECT id, s3_key
       FROM call_recordings
       WHERE
         deleted_at IS NOT NULL
         AND deleted_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
         AND (is_deleted_permanently IS NULL OR is_deleted_permanently = false)
       ORDER BY deleted_at ASC
       LIMIT 100`
    );

    const staleRecordings = staleResult.rows;
    console.log(`🔍 Found ${staleRecordings.length} recordings pending permanent deletion`);

    // 3. Delete each from S3
    for (const rec of staleRecordings) {
      try {
        if (rec.s3_key) {
          await deleteRecordingFromS3(rec.s3_key);
          console.log(`🗑️  S3 deleted: ${rec.s3_key}`);
        }

        // 4. Mark permanently deleted in DB
        await db.query(
          `UPDATE call_recordings
           SET is_deleted_permanently = true, updated_at = NOW()
           WHERE id = $1`,
          [rec.id]
        );

        purgedCount++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Failed to purge recording ${rec.id}: ${errMsg}`);
        failedCount++;
        errors.push(`${rec.id}: ${errMsg}`);
      }
    }

    // 5. Clean up orphaned encryption keys (for permanently deleted recordings)
    const orphanedKeysResult = await db.query(
      `DELETE FROM call_recording_encryption_keys
       WHERE recording_id IN (
         SELECT id FROM call_recordings
         WHERE is_deleted_permanently = true
       )
       RETURNING recording_id`
    );

    const orphanedKeysDeleted = orphanedKeysResult.rows.length;
    if (orphanedKeysDeleted > 0) {
      console.log(`🔑 Cleaned ${orphanedKeysDeleted} orphaned encryption keys`);
    }

    const elapsedMs = Date.now() - jobStart;

    console.log(`✅ Cleanup job complete in ${elapsedMs}ms:`);
    console.log(`   Purged: ${purgedCount} recordings from S3`);
    console.log(`   Failed: ${failedCount}`);
    console.log(`   Orphaned keys cleaned: ${orphanedKeysDeleted}`);

    return NextResponse.json({
      success: true,
      purgedCount,
      failedCount,
      orphanedKeysDeleted,
      retentionDays: RETENTION_DAYS,
      durationMs: elapsedMs,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Cleanup job failed:', error);
    return NextResponse.json(
      {
        error: 'Cleanup job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        purgedCount,
        failedCount,
        durationMs: Date.now() - jobStart,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const secret = request.headers.get('x-cron-secret')
      || request.headers.get('authorization')?.replace('Bearer ', '');

    if (secret !== process.env.RESEARCH_PIPELINE_CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Count recordings pending permanent deletion
    const result = await db.query(
      `SELECT COUNT(*) as pending_purge
       FROM call_recordings
       WHERE
         deleted_at IS NOT NULL
         AND deleted_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
         AND (is_deleted_permanently IS NULL OR is_deleted_permanently = false)`
    );

    const pendingPurge = parseInt(result.rows[0].pending_purge, 10);

    // Count total soft-deleted (within retention window — still recoverable)
    const softDeletedResult = await db.query(
      `SELECT COUNT(*) as soft_deleted
       FROM call_recordings
       WHERE
         deleted_at IS NOT NULL
         AND deleted_at >= NOW() - INTERVAL '${RETENTION_DAYS} days'`
    );

    const softDeleted = parseInt(softDeletedResult.rows[0].soft_deleted, 10);

    return NextResponse.json({
      status: 'ready',
      pendingPermanentPurge: pendingPurge,
      softDeletedWithinRetention: softDeleted,
      retentionDays: RETENTION_DAYS,
      nextRunSchedule: 'Daily at 02:00 UTC',
      endpoint: 'POST /api/jobs/cleanup-recordings',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to check cleanup job status' },
      { status: 500 }
    );
  }
}
