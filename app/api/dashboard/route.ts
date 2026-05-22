/**
 * GET /api/dashboard
 * Returns aggregated data for the portal home dashboard.
 * Phase 52: Extended with recentMessages, unreadCount, userName.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

interface RecentCall {
  id: string;
  type: string;
  contactName: string | null;
  contactPhone: string | null;
  contactId: string | null;
  durationSeconds: number;
  languagePair: string;
  hasNotes: boolean;
  notesPreview: string | null;
  createdAt: string;
}

interface OnlineContact {
  id: string;
  name: string;
  lastSeenAt: string | null;
  language: string;
}

interface RecentMessage {
  id: string;
  channel: string;
  content: string | null;
  direction: string;
  mediaType: string | null;
  mediaName: string | null;
  senderName: string | null;
  senderId: string | null;
  receiverName: string | null;
  receiverId: string | null;
  isRead: boolean;
  createdAt: string;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sql = neon(process.env.DATABASE_URL!);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Run all queries in parallel for speed
    const [
      statsRows, allTimeRows, recentCallRows, annotatedCallRows,
      onlineContactRows, pinnedContactRows, userRows,
      recentMessageRows, unreadCountRows,
    ] = await Promise.all([

      // This-month call stats
      sql`
        SELECT
          COUNT(*)::int                              AS calls_this_month,
          COALESCE(SUM(duration_seconds), 0)::int   AS seconds_this_month
        FROM conversations
        WHERE user_id = ${user.id}::uuid
          AND deleted_at IS NULL
          AND created_at >= ${startOfMonth}
      `,

      // All-time call stats
      sql`
        SELECT
          COUNT(*)::int                              AS total_calls,
          COALESCE(SUM(duration_seconds), 0)::int   AS total_seconds
        FROM conversations
        WHERE user_id = ${user.id}::uuid
          AND deleted_at IS NULL
      `,

      // Last 5 calls
      sql`
        SELECT
          c.id, c.conversation_type, c.duration_seconds, c.language_pair,
          c.contact_phone, c.contact_id, c.notes, c.created_at,
          u.name AS contact_name, u.phone_number AS contact_phone_number
        FROM conversations c
        LEFT JOIN users u ON u.id = c.contact_id
        WHERE c.user_id = ${user.id}::uuid AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC LIMIT 5
      `,

      // Last 5 calls with notes (CRM follow-ups)
      sql`
        SELECT
          c.id, c.conversation_type, c.duration_seconds, c.language_pair,
          c.contact_phone, c.contact_id, c.notes, c.created_at,
          u.name AS contact_name, u.phone_number AS contact_phone_number
        FROM conversations c
        LEFT JOIN users u ON u.id = c.contact_id
        WHERE c.user_id = ${user.id}::uuid
          AND c.deleted_at IS NULL
          AND c.notes IS NOT NULL AND c.notes != ''
        ORDER BY c.created_at DESC LIMIT 5
      `,

      // Online contacts (seen in last 90 seconds)
      sql`
        SELECT u.id, u.name, u.phone_number,
               u.language_preference AS language, u.last_seen_at
        FROM users u
        WHERE u.id::text != ${user.id}
          AND (u.private IS NULL OR u.private = false)
          AND u.last_seen_at >= NOW() - INTERVAL '90 seconds'
        ORDER BY u.last_seen_at DESC LIMIT 8
      `,

      // Pinned contacts
      sql`
        SELECT u.id, u.name, u.phone_number,
               u.language_preference AS language, u.last_seen_at
        FROM contacts c
        JOIN users u ON u.id = c.contact_user_id
        WHERE c.user_id = ${user.id}::uuid
          AND c.is_pinned = TRUE
          AND (u.private IS NULL OR u.private = false)
        ORDER BY u.name ASC LIMIT 12
      `,

      // Current user name
      sql`SELECT name, language_preference FROM users WHERE id = ${user.id}::uuid LIMIT 1`,

      // Recent messages (chat, voice, file, photo)
      sql`
        SELECT
          m.id, m.channel, m.content, m.direction,
          m.media_type, m.media_name, m.read_at, m.created_at,
          s.name AS sender_name, s.id AS sender_id,
          r.name AS receiver_name, r.id AS receiver_id
        FROM messages m
        LEFT JOIN users s ON s.id = m.sender_user_id
        LEFT JOIN users r ON r.id = m.receiver_user_id
        WHERE (m.sender_user_id = ${user.id}::uuid OR m.receiver_user_id = ${user.id}::uuid)
          AND m.deleted_at IS NULL
          AND m.channel IN ('in_app_chat','voice_message','file','photo')
        ORDER BY m.created_at DESC LIMIT 8
      `.catch(() => [] as any[]),

      // Unread message count
      sql`
        SELECT COUNT(*)::int AS unread_count
        FROM messages
        WHERE receiver_user_id = ${user.id}::uuid
          AND deleted_at IS NULL
          AND read_at IS NULL
          AND channel IN ('in_app_chat','voice_message','file','photo')
      `.catch(() => [{ unread_count: 0 }] as any[]),
    ]);

    const mapCall = (c: any): RecentCall => ({
      id: String(c.id),
      type: String(c.conversation_type),
      contactName: c.contact_name ? String(c.contact_name) : null,
      contactPhone: c.contact_phone_number
        ? String(c.contact_phone_number)
        : c.contact_phone ? String(c.contact_phone) : null,
      contactId: c.contact_id ? String(c.contact_id) : null,
      durationSeconds: Number(c.duration_seconds ?? 0),
      languagePair: String(c.language_pair ?? ''),
      hasNotes: !!(c.notes && String(c.notes).trim()),
      notesPreview: c.notes ? String(c.notes).slice(0, 80) : null,
      createdAt: new Date(String(c.created_at)).toISOString(),
    });

    const mapContact = (c: any): OnlineContact => ({
      id: String(c.id),
      name: c.name ? String(c.name) : (c.phone_number ? String(c.phone_number) : 'Unknown'),
      lastSeenAt: c.last_seen_at ? new Date(String(c.last_seen_at)).toISOString() : null,
      language: c.language ? String(c.language) : 'en',
    });

    return NextResponse.json({
      userName: userRows[0]?.name ? String(userRows[0].name) : null,
      stats: {
        callsThisMonth: Number(statsRows[0]?.calls_this_month ?? 0),
        minutesThisMonth: Math.round(Number(statsRows[0]?.seconds_this_month ?? 0) / 60),
        totalCalls: Number(allTimeRows[0]?.total_calls ?? 0),
        totalMinutes: Math.round(Number(allTimeRows[0]?.total_seconds ?? 0) / 60),
        onlineContacts: onlineContactRows.length,
        unreadMessages: Number(unreadCountRows[0]?.unread_count ?? 0),
      },
      recentCalls: recentCallRows.map(mapCall),
      annotatedCalls: annotatedCallRows.map(mapCall),
      onlineContacts: onlineContactRows.map(mapContact),
      pinnedContacts: pinnedContactRows.map(mapContact),
      recentMessages: (recentMessageRows as any[]).map((m): RecentMessage => ({
        id: String(m.id),
        channel: String(m.channel),
        content: m.content ? String(m.content).slice(0, 120) : null,
        direction: String(m.direction ?? 'outbound'),
        mediaType: m.media_type ? String(m.media_type) : null,
        mediaName: m.media_name ? String(m.media_name) : null,
        senderName: m.sender_name ? String(m.sender_name) : null,
        senderId: m.sender_id ? String(m.sender_id) : null,
        receiverName: m.receiver_name ? String(m.receiver_name) : null,
        receiverId: m.receiver_id ? String(m.receiver_id) : null,
        isRead: !!m.read_at,
        createdAt: new Date(String(m.created_at)).toISOString(),
      })),
    });
  } catch (err) {
    console.error('[dashboard]', err);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
