/**
 * POST /api/jobs/send-followups
 * Daily cron (8 AM UTC): find conversations with follow_up_at <= NOW()
 * that haven't been notified yet, create a notification + email for the user.
 *
 * Secured by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { sendNotificationEmail } from '@/lib/email-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Find all due reminders not yet sent
    const dueReminders = await sql`
      SELECT
        c.id,
        c.user_id,
        c.contact_id,
        c.follow_up_at,
        c.notes,
        u_contact.name AS contact_name,
        u_contact.phone_number AS contact_phone
      FROM conversations c
      LEFT JOIN users u_contact ON u_contact.id = c.contact_id
      WHERE c.follow_up_at IS NOT NULL
        AND c.follow_up_at <= NOW()
        AND c.follow_up_sent = FALSE
        AND c.deleted_at IS NULL
      LIMIT 500
    `;

    if (dueReminders.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    let notified = 0;

    for (const reminder of dueReminders) {
      const contactLabel = reminder.contact_name
        ? String(reminder.contact_name)
        : (reminder.contact_phone ? String(reminder.contact_phone) : 'your contact');

      const title = `Follow-up reminder: call with ${contactLabel}`;
      const body = reminder.notes
        ? `Notes: ${String(reminder.notes).slice(0, 100)}`
        : 'You set a follow-up reminder for this call.';

      // Create in-app notification
      await sql`
        INSERT INTO user_notifications (user_id, type, title, body, link)
        VALUES (
          ${String(reminder.user_id)}::uuid,
          'follow_up',
          ${title},
          ${body},
          ${`/calls/${String(reminder.id)}`}
        )
      `.catch(() => {});

      // Email notification (non-blocking)
      sendNotificationEmail(String(reminder.user_id), 'follow_up', {
        title,
        body,
      }).catch(() => {});

      // Mark as sent
      await sql`
        UPDATE conversations
        SET follow_up_sent = TRUE, updated_at = NOW()
        WHERE id = ${String(reminder.id)}::uuid
      `;

      notified++;
    }

    console.log(`[send-followups] Notified ${notified} follow-up reminders`);
    return NextResponse.json({ ok: true, processed: notified });
  } catch (err) {
    console.error('[send-followups]', err);
    return NextResponse.json({ error: 'Failed to process follow-ups' }, { status: 500 });
  }
}
