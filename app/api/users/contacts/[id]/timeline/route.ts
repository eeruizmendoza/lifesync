/**
 * GET /api/users/contacts/[id]/timeline
 *
 * Returns a merged, paginated timeline of ALL interactions with a contact:
 * - Voice & video calls (from conversations table)
 * - In-app chat, SMS, voice messages, files, photos, email, room sessions
 *   (from messages table)
 *
 * Items are sorted newest-first. Each item has a `kind` and `icon` field.
 *
 * Query params:
 *   limit   — default 30, max 100
 *   offset  — default 0
 *   channel — filter to one channel (call | video | in_app_chat | sms | ...)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const ICONS: Record<string, string> = {
  call:          '📞',
  video:         '📹',
  in_app_chat:   '💬',
  sms:           '📱',
  voice_message: '🎙️',
  email:         '📧',
  file:          '📎',
  photo:         '📷',
  room_session:  '🏛️',
};

type TimelineItem = {
  id: string;
  kind: string;
  channel: string;
  icon: string;
  direction: string;
  createdAt: string;
  content: string | null;
  translatedContent: string | null;
  durationSeconds: number | null;
  language: string | null;
  contactLanguage: string | null;
  languagePair: string | null;
  status: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaName: string | null;
  mediaSizeBytes: number | null;
};

function formatItem(r: Record<string, unknown>, kind: string): TimelineItem {
  return {
    id:               String(r.id),
    kind,
    channel:          kind,
    icon:             ICONS[kind] ?? '💬',
    direction:        String(r.direction ?? 'outbound'),
    createdAt:        String(r.created_at),
    content:          (r.content as string) ?? null,
    translatedContent:(r.translated_content as string) ?? null,
    durationSeconds:  r.duration_seconds != null ? Number(r.duration_seconds) : null,
    language:         (r.language as string) ?? null,
    contactLanguage:  (r.contact_language as string) ?? null,
    languagePair:     (r.language_pair as string) ?? null,
    status:           (r.status as string) ?? null,
    mediaUrl:         (r.media_url as string) ?? null,
    mediaType:        (r.media_type as string) ?? null,
    mediaName:        (r.media_name as string) ?? null,
    mediaSizeBytes:   r.media_size_bytes != null ? Number(r.media_size_bytes) : null,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: contactId } = await context.params;
    if (!contactId) return NextResponse.json({ error: 'Missing contact id' }, { status: 400 });

    const url = new URL(request.url);
    const limit         = Math.min(100, parseInt(url.searchParams.get('limit')   ?? '30', 10));
    const offset        = Math.max(0,   parseInt(url.searchParams.get('offset')  ?? '0',  10));
    const channelFilter = url.searchParams.get('channel') ?? null;

    const sql = neon(process.env.DATABASE_URL!);

    const callChannels  = ['call', 'video'];
    const wantCalls     = !channelFilter || callChannels.includes(channelFilter);
    const wantMessages  = !channelFilter || !callChannels.includes(channelFilter);

    // ── Fetch calls ───────────────────────────────────────────────────────────
    const callRows = wantCalls ? await sql`
      SELECT
        id::text,
        conversation_type,
        CASE WHEN user_id = ${user.id}::uuid THEN 'outbound' ELSE 'inbound' END AS direction,
        created_at,
        duration_seconds,
        user_language   AS language,
        contact_language,
        language_pair,
        status,
        NULL::text AS content,
        NULL::text AS translated_content,
        NULL::text AS media_url,
        NULL::text AS media_type,
        NULL::text AS media_name,
        NULL::bigint AS media_size_bytes
      FROM conversations
      WHERE deleted_at IS NULL
        AND (
          (user_id = ${user.id}::uuid AND contact_id = ${contactId}::uuid)
          OR
          (user_id = ${contactId}::uuid AND contact_id = ${user.id}::uuid)
        )
    ` : [];

    // ── Fetch messages ────────────────────────────────────────────────────────
    const msgRows = wantMessages ? await sql`
      SELECT
        id::text,
        channel,
        direction,
        created_at,
        content,
        translated_content,
        language,
        NULL::text AS contact_language,
        NULL::text AS language_pair,
        status,
        media_url,
        media_type,
        media_name,
        media_size_bytes,
        NULL::int AS duration_seconds
      FROM messages
      WHERE deleted_at IS NULL
        AND (
          (sender_user_id = ${user.id}::uuid AND receiver_user_id = ${contactId}::uuid)
          OR
          (sender_user_id = ${contactId}::uuid AND receiver_user_id = ${user.id}::uuid)
        )
        ${channelFilter ? sql`AND channel = ${channelFilter}` : sql``}
    ` : [];

    // ── Merge + sort ──────────────────────────────────────────────────────────
    const callItems: TimelineItem[] = (callRows as Record<string, unknown>[]).map(r => {
      const kind = String(r.conversation_type) === 'video' ? 'video' : 'call';
      return formatItem(r, kind);
    }).filter(item => !channelFilter || item.kind === channelFilter);

    const msgItems: TimelineItem[] = (msgRows as Record<string, unknown>[]).map(r =>
      formatItem(r, String(r.channel))
    );

    const all = [...callItems, ...msgItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total   = all.length;         // approximate (pre-pagination)
    const paged   = all.slice(offset, offset + limit);
    const hasMore = offset + paged.length < total;

    return NextResponse.json({ ok: true, items: paged, total, limit, offset, hasMore });
  } catch (err) {
    console.error('[timeline]', err);
    return NextResponse.json({ error: 'Failed to load timeline' }, { status: 500 });
  }
}
