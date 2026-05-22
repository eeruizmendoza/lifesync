/**
 * GET /api/calls/[id]
 * Returns detailed info for a single conversation (call):
 *   - conversation metadata
 *   - associated recordings (list)
 *   - transcript lines from the newest recording
 *
 * Auth: Bearer token or lifesync_token cookie.
 * Access: caller or contact only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);

    // Fetch the conversation — user must be caller or contact
    const [conv] = await sql`
      SELECT
        c.id,
        c.conversation_type,
        c.user_language,
        c.contact_language,
        c.language_pair,
        c.duration_seconds,
        c.contact_phone,
        c.contact_id,
        c.user_id,
        c.org_id,
        c.notes,
        c.created_at,
        c.updated_at,
        u.name       AS contact_name,
        u.phone_number AS contact_phone_number,
        me.name      AS caller_name,
        me.phone_number AS caller_phone_number
      FROM conversations c
      LEFT JOIN users u  ON u.id = c.contact_id
      LEFT JOIN users me ON me.id = c.user_id
      WHERE c.id = ${id}::uuid
        AND c.deleted_at IS NULL
        AND (c.user_id = ${user.id}::uuid OR c.contact_id = ${user.id}::uuid)
    `;

    if (!conv) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

    // Fetch recordings for this conversation
    const recordings = await sql`
      SELECT
        id,
        recording_type,
        mime_type,
        file_size_bytes,
        duration_seconds,
        processing_status,
        transcription_status,
        created_at
      FROM call_recordings
      WHERE conversation_id = ${id}::uuid
        AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;

    // Fetch transcript lines from the newest recording that has them
    let transcriptLines: Array<{
      id: string;
      speakerId: string;
      speakerLabel: string;
      originalText: string;
      originalLanguage: string;
      translatedText: string | null;
      translatedLanguage: string | null;
      startMs: number;
      endMs: number;
      confidence: number | null;
    }> = [];

    if (recordings.length > 0) {
      const newestRecordingId = String(recordings[0].id);
      const lines = await sql`
        SELECT
          id,
          speaker_id,
          speaker_label,
          original_text,
          original_language,
          translated_text,
          translated_language,
          start_ms,
          end_ms,
          confidence
        FROM call_recording_transcripts
        WHERE recording_id = ${newestRecordingId}::uuid
        ORDER BY start_ms ASC
      `;
      transcriptLines = lines.map(l => ({
        id: String(l.id),
        speakerId: String(l.speaker_id ?? ''),
        speakerLabel: String(l.speaker_label ?? 'Speaker'),
        originalText: String(l.original_text ?? ''),
        originalLanguage: String(l.original_language ?? conv.user_language ?? ''),
        translatedText: l.translated_text ? String(l.translated_text) : null,
        translatedLanguage: l.translated_language ? String(l.translated_language) : null,
        startMs: Number(l.start_ms ?? 0),
        endMs: Number(l.end_ms ?? 0),
        confidence: l.confidence != null ? Number(l.confidence) : null,
      }));
    }

    return NextResponse.json({
      ok: true,
      call: {
        id: String(conv.id),
        type: String(conv.conversation_type),
        userLanguage: String(conv.user_language ?? ''),
        contactLanguage: String(conv.contact_language ?? ''),
        languagePair: String(conv.language_pair ?? ''),
        durationSeconds: Number(conv.duration_seconds ?? 0),
        contactPhone: String(conv.contact_phone_number ?? conv.contact_phone ?? ''),
        contactName: conv.contact_name ? String(conv.contact_name) : null,
        callerName: conv.caller_name ? String(conv.caller_name) : null,
        callerPhone: String(conv.caller_phone_number ?? ''),
        callerId: String(conv.user_id),
        contactId: conv.contact_id ? String(conv.contact_id) : null,
        notes: conv.notes ? String(conv.notes) : null,
        createdAt: new Date(String(conv.created_at)).toISOString(),
        updatedAt: new Date(String(conv.updated_at)).toISOString(),
      },
      recordings: recordings.map(r => ({
        id: String(r.id),
        type: String(r.recording_type ?? 'audio'),
        mimeType: String(r.mime_type ?? 'audio/webm'),
        fileSizeBytes: Number(r.file_size_bytes ?? 0),
        durationSeconds: Number(r.duration_seconds ?? 0),
        processingStatus: String(r.processing_status ?? 'pending'),
        transcriptionStatus: String(r.transcription_status ?? 'pending'),
        createdAt: new Date(String(r.created_at)).toISOString(),
      })),
      transcriptLines,
    });
  } catch (err) {
    console.error('[calls/[id]]', err);
    return NextResponse.json({ error: 'Failed to load call details' }, { status: 500 });
  }
}
