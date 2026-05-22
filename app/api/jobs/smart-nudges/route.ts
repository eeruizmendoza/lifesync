/**
 * POST /api/jobs/smart-nudges
 * Phase 54 — Smart Notifications + Nudges
 *
 * Runs daily at 8:30 AM UTC (after send-followups at 8 AM).
 * Generates three types of intelligent nudges:
 *
 * 1. dormant_contact   — contacts not spoken to in 30+ days
 * 2. unread_digest     — morning summary of unread messages
 * 3. ai_action_item    — action items from recent AI summaries
 *
 * All notifications are deduped: won't re-notify within 7 days for dormant,
 * 24h for unread_digest, and once per AI summary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  // Auth
  const cronSecret = request.headers.get('x-cron-secret')
    ?? request.headers.get('authorization')?.replace('Bearer ', '');
  if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const stats = { dormant: 0, unreadDigest: 0, actionItems: 0 };

  // ── 1. Dormant contact nudges ───────────────────────────────────────────────
  // Find (user_id, contact_id) pairs where last interaction was 30+ days ago
  // and we haven't sent a dormant_contact notification in the past 7 days.
  try {
    const dormantPairs = await sql`
      SELECT
        c.user_id,
        c.contact_user_id,
        u.name AS contact_name,
        MAX(COALESCE(conv.created_at, '2000-01-01'::timestamptz)) AS last_interaction
      FROM contacts c
      JOIN users u ON u.id = c.contact_user_id
      LEFT JOIN conversations conv
        ON (
          (conv.user_id = c.user_id AND conv.contact_id = c.contact_user_id)
          OR (conv.contact_id = c.user_id AND conv.user_id = c.contact_user_id)
        )
        AND conv.deleted_at IS NULL
        AND conv.duration_seconds > 0
      WHERE c.is_pinned = FALSE   -- pinned contacts shown on dashboard already
        AND (u.private IS NULL OR u.private = false)
      GROUP BY c.user_id, c.contact_user_id, u.name
      HAVING MAX(COALESCE(conv.created_at, '2000-01-01'::timestamptz)) < NOW() - INTERVAL '30 days'
      LIMIT 200
    `;

    for (const pair of dormantPairs as any[]) {
      // Check if we already sent a dormant notification for this contact in the past 7 days
      const existing = await sql`
        SELECT id FROM user_notifications
        WHERE user_id = ${pair.user_id}::uuid
          AND type = 'dormant_contact'
          AND body LIKE ${'%' + String(pair.contact_user_id) + '%'}
          AND created_at >= NOW() - INTERVAL '7 days'
        LIMIT 1
      `.catch(() => []);

      if ((existing as any[]).length > 0) continue;

      const daysSince = Math.floor(
        (Date.now() - new Date(String(pair.last_interaction)).getTime()) / 86400000,
      );
      const name = String(pair.contact_name ?? 'A contact');
      const daysLabel = daysSince > 365 ? 'over a year' : `${daysSince} days`;

      await sql`
        INSERT INTO user_notifications (user_id, type, title, body, link)
        VALUES (
          ${pair.user_id}::uuid,
          'dormant_contact',
          ${'Stay in touch with ' + name},
          ${'You haven\'t spoken to ' + name + ' in ' + daysLabel + '. Consider reaching out. [contact:' + String(pair.contact_user_id) + ']'},
          ${'/contacts/' + String(pair.contact_user_id)}
        )
      `.catch(() => {});

      stats.dormant++;
    }
  } catch (err) {
    console.error('[smart-nudges] dormant contacts error:', err);
  }

  // ── 2. Unread message digest ────────────────────────────────────────────────
  // For each user with unread messages: create one daily digest notification.
  try {
    const usersWithUnread = await sql`
      SELECT
        m.receiver_user_id AS user_id,
        COUNT(*)::int AS unread_count,
        COUNT(DISTINCT COALESCE(m.sender_user_id::text, ''))::int AS sender_count
      FROM messages m
      WHERE m.read_at IS NULL
        AND m.deleted_at IS NULL
        AND m.direction = 'inbound'
        AND m.channel IN ('in_app_chat','voice_message','file','photo')
        AND m.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY m.receiver_user_id
      HAVING COUNT(*) > 0
      LIMIT 500
    `.catch(() => []);

    for (const row of usersWithUnread as any[]) {
      // Skip if already sent unread_digest today
      const alreadySent = await sql`
        SELECT id FROM user_notifications
        WHERE user_id = ${row.user_id}::uuid
          AND type = 'unread_digest'
          AND created_at >= NOW() - INTERVAL '20 hours'
        LIMIT 1
      `.catch(() => []);

      if ((alreadySent as any[]).length > 0) continue;

      const count = Number(row.unread_count);
      const senders = Number(row.sender_count);
      const title = `${count} unread message${count !== 1 ? 's' : ''}`;
      const body = `You have ${count} unread message${count !== 1 ? 's' : ''} from ${senders} contact${senders !== 1 ? 's' : ''}. Check your conversations.`;

      await sql`
        INSERT INTO user_notifications (user_id, type, title, body, link)
        VALUES (
          ${row.user_id}::uuid,
          'unread_digest',
          ${title},
          ${body},
          '/contacts'
        )
      `.catch(() => {});

      stats.unreadDigest++;
    }
  } catch (err) {
    console.error('[smart-nudges] unread digest error:', err);
  }

  // ── 3. AI action item nudges ────────────────────────────────────────────────
  // Find recent calls with AI summaries that have action items,
  // and notify the user once per call summary.
  try {
    const summariesWithActions = await sql`
      SELECT
        c.id AS call_id,
        c.user_id,
        c.ai_summary,
        c.ai_summary_at,
        u.name AS contact_name
      FROM conversations c
      LEFT JOIN users u ON u.id = c.contact_id
      WHERE c.ai_summary IS NOT NULL
        AND c.ai_summary_at >= NOW() - INTERVAL '48 hours'
        AND c.ai_summary->'actionItems' IS NOT NULL
        AND jsonb_array_length(c.ai_summary->'actionItems') > 0
        AND c.deleted_at IS NULL
      ORDER BY c.ai_summary_at DESC
      LIMIT 100
    `.catch(() => []);

    for (const row of summariesWithActions as any[]) {
      // Check if we already notified for this specific call's action items
      const already = await sql`
        SELECT id FROM user_notifications
        WHERE user_id = ${row.user_id}::uuid
          AND type = 'ai_action_item'
          AND body LIKE ${'%' + String(row.call_id) + '%'}
        LIMIT 1
      `.catch(() => []);

      if ((already as any[]).length > 0) continue;

      const summary = row.ai_summary as any;
      const items: any[] = Array.isArray(summary?.actionItems) ? summary.actionItems : [];
      if (items.length === 0) continue;

      const firstItem = String(items[0]?.text ?? '');
      const extra = items.length > 1 ? ` (+${items.length - 1} more)` : '';
      const contactLabel = row.contact_name ? ` from your call with ${row.contact_name}` : '';

      await sql`
        INSERT INTO user_notifications (user_id, type, title, body, link)
        VALUES (
          ${row.user_id}::uuid,
          'ai_action_item',
          ${'Action item' + (items.length > 1 ? 's' : '') + contactLabel},
          ${firstItem + extra + ' [call:' + String(row.call_id) + ']'},
          ${'/calls/' + String(row.call_id)}
        )
      `.catch(() => {});

      stats.actionItems++;
    }
  } catch (err) {
    console.error('[smart-nudges] action items error:', err);
  }

  return NextResponse.json({
    ok: true,
    stats,
    total: stats.dormant + stats.unreadDigest + stats.actionItems,
  });
}
