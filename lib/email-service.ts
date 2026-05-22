/**
 * Email Service — Phase 3 Multi-Tenant SaaS
 * Uses Resend (resend.com) for transactional email delivery.
 *
 * Required env vars:
 *   RESEND_API_KEY      — Resend API key (set in Vercel)
 *   FROM_EMAIL          — Sender address (e.g. "LifeSync <invites@lifesync.app>")
 *   NEXT_PUBLIC_APP_URL — App base URL for invite links
 */

import { Resend } from 'resend';

const FROM_EMAIL = process.env.FROM_EMAIL ?? 'LifeSync <invites@lifesync.app>';
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lifesync.app';

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(key);
}

// ============================================================================
// Invite Email
// ============================================================================

export interface SendInviteEmailParams {
  toEmail: string;
  orgName: string;
  inviterName: string;
  role: string;
  inviteToken: string;
}

export async function sendOrgInviteEmail(params: SendInviteEmailParams): Promise<void> {
  const { toEmail, orgName, inviterName, role, inviteToken } = params;
  const inviteUrl = `${APP_URL}/invite/${inviteToken}`;
  const resend = getResend();

  const html = buildInviteHtml({ orgName, inviterName, role, inviteUrl });

  const { error } = await resend.emails.send({
    from:    FROM_EMAIL,
    to:      toEmail,
    subject: `${inviterName} invited you to join ${orgName} on LifeSync`,
    html,
  });

  if (error) {
    console.error('[email-service] Failed to send invite email:', error);
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  console.info(`[email-service] Invite email sent to ${toEmail} for org "${orgName}"`);
}

// ============================================================================
// HTML Templates
// ============================================================================

function buildInviteHtml(params: {
  orgName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}): string {
  const { orgName, inviterName, role, inviteUrl } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've been invited to ${orgName}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

        <!-- Header -->
        <tr><td style="background:#2563eb;padding:32px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">LifeSync</div>
          <div style="font-size:13px;color:#93c5fd;margin-top:4px;">Real-time translation for every conversation</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px 32px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">
            You've been invited to join <span style="color:#2563eb;">${escapeHtml(orgName)}</span>
          </h1>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
            <strong style="color:#374151;">${escapeHtml(inviterName)}</strong> has invited you to collaborate on
            LifeSync as a <strong style="color:#374151;">${escapeHtml(role)}</strong>.
          </p>

          <!-- CTA button -->
          <div style="text-align:center;margin:32px 0;">
            <a href="${escapeHtml(inviteUrl)}"
               style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;">
              Accept Invite
            </a>
          </div>

          <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;text-align:center;">
            Or copy this link into your browser:
          </p>
          <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;word-break:break-all;">
            ${escapeHtml(inviteUrl)}
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            This invite link expires in 7 days. If you didn't expect this email, you can safely ignore it.
          </p>
          <p style="margin:8px 0 0;font-size:12px;color:#9ca3af;">
            &copy; ${new Date().getFullYear()} LifeSync. All rights reserved.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ============================================================================
// Notification Emails — missed call, member joined, quota warning
// ============================================================================

/**
 * Resolve a user's email address and notification preferences from the DB,
 * then send the appropriate email if the user has an email and has the
 * relevant preference enabled.
 *
 * Non-fatal: all errors are logged but never thrown.
 */
export async function sendNotificationEmail(
  userId: string,
  type: 'missed_call' | 'member_joined' | 'quota_warning',
  payload: {
    title: string;
    body: string | null;
    callerName?: string;
    orgName?: string;
    upgradeUrl?: string;
  }
): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return; // Silently skip if not configured

    // Dynamic import to avoid import-time errors if @neondatabase/serverless isn't ready
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL!);

    const [user] = await sql`
      SELECT email, notification_calls, notification_invites
      FROM users
      WHERE id = ${userId}::uuid
    `;
    if (!user?.email) return;

    // Respect per-type prefs
    if (type === 'missed_call' && user.notification_calls === false) return;
    if (type === 'member_joined' && user.notification_invites === false) return;
    // quota_warning always sent (business-critical)

    const resend = getResend();
    let subject: string;
    let html: string;

    if (type === 'missed_call') {
      subject = payload.title;
      html = buildSimpleNotificationHtml({
        icon: '📞',
        title: payload.title,
        body: payload.body ?? 'You missed a call. Check your call history for details.',
        ctaText: 'View Call History',
        ctaUrl: `${APP_URL}/calls`,
      });
    } else if (type === 'member_joined') {
      subject = payload.title;
      html = buildSimpleNotificationHtml({
        icon: '🎉',
        title: payload.title,
        body: payload.body ?? 'A new member has joined your organization.',
        ctaText: 'View Members',
        ctaUrl: `${APP_URL}/organization`,
      });
    } else {
      subject = `⚠️ ${payload.title}`;
      html = buildSimpleNotificationHtml({
        icon: '⚠️',
        title: payload.title,
        body: payload.body ?? 'Your organization is approaching a usage limit.',
        ctaText: 'Upgrade Plan',
        ctaUrl: payload.upgradeUrl ?? `${APP_URL}/billing`,
      });
    }

    await resend.emails.send({
      from: FROM_EMAIL,
      to: String(user.email),
      subject,
      html,
    });
  } catch (err) {
    console.error('[email-service] sendNotificationEmail failed:', err);
    // Non-fatal — never propagate
  }
}

// ============================================================================
// Simple notification email template (shared by missed call / quota / join)
// ============================================================================

function buildSimpleNotificationHtml(params: {
  icon: string;
  title: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
}): string {
  const { icon, title, body, ctaText, ctaUrl } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

        <!-- Header -->
        <tr><td style="background:#2563eb;padding:24px 32px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">LifeSync</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 32px;text-align:center;">
          <div style="font-size:40px;margin-bottom:16px;">${icon}</div>
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;">${escapeHtml(title)}</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">${escapeHtml(body)}</p>

          <a href="${escapeHtml(ctaUrl)}"
             style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
            ${escapeHtml(ctaText)}
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            You're receiving this because you have an account on LifeSync.
            Update your notification preferences in <a href="${APP_URL}/settings" style="color:#6b7280;">Settings</a>.
          </p>
          <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;">
            &copy; ${new Date().getFullYear()} LifeSync. All rights reserved.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ============================================================================
// Welcome Email
// ============================================================================

export async function sendWelcomeEmail(params: {
  toEmail: string;
  userName: string | null;
  orgName: string;
}): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return;
    const resend = getResend();
    const { toEmail, userName, orgName } = params;
    const displayName = userName ?? 'there';

    await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject: `Welcome to LifeSync, ${displayName}! 🎉`,
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Welcome to LifeSync</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <tr><td style="background:#2563eb;padding:32px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:#fff;">LifeSync</div>
          <div style="font-size:13px;color:#93c5fd;margin-top:4px;">Real-time translation for every conversation</div>
        </td></tr>
        <tr><td style="padding:40px 32px;">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;">Welcome, ${escapeHtml(displayName)}! 🎉</h1>
          <p style="margin:0 0 16px;font-size:15px;color:#6b7280;line-height:1.6;">
            Your organization <strong style="color:#374151;">${escapeHtml(orgName)}</strong> is all set up on LifeSync.
            You're ready to start making real-time translated calls in any language.
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">Here's what to do next:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            ${['Go to Contacts and add your first contact', 'Start a call and experience real-time translation', 'Invite your team members from the Organization page'].map((step, i) => `
            <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
              <span style="display:inline-flex;align-items:center;gap:12px;font-size:14px;color:#374151;">
                <span style="width:24px;height:24px;background:#eff6ff;color:#2563eb;border-radius:50%;font-weight:700;font-size:12px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</span>
                ${step}
              </span>
            </td></tr>`).join('')}
          </table>
          <div style="text-align:center;">
            <a href="${APP_URL}/contacts"
               style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;">
              Get Started
            </a>
          </div>
        </td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            &copy; ${new Date().getFullYear()} LifeSync. All rights reserved.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
  } catch (err) {
    console.error('[email-service] sendWelcomeEmail failed:', err);
  }
}

// ============================================================================
// Weekly Digest Email
// ============================================================================

export interface WeeklyDigestData {
  orgName: string;
  weekLabel: string; // e.g. "May 13–19, 2026"
  totalCalls: number;
  totalMinutes: number;
  activeMembersCount: number;
  topLanguagePair: string | null;
  newMembersCount: number;
}

export async function sendWeeklyDigestEmail(params: {
  toEmail: string;
  userName: string | null;
  digest: WeeklyDigestData;
}): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return;
    const resend = getResend();
    const { toEmail, userName, digest } = params;

    const stats = [
      { label: 'Calls made', value: String(digest.totalCalls) },
      { label: 'Minutes translated', value: String(digest.totalMinutes) },
      { label: 'Active members', value: String(digest.activeMembersCount) },
      { label: 'New members', value: String(digest.newMembersCount) },
    ];

    await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject: `LifeSync weekly digest — ${escapeHtml(digest.orgName)} (${digest.weekLabel})`,
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>LifeSync Weekly Digest</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <tr><td style="background:#2563eb;padding:28px 32px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#fff;">LifeSync</div>
          <div style="font-size:13px;color:#93c5fd;margin-top:4px;">Weekly digest for ${escapeHtml(digest.orgName)}</div>
        </td></tr>
        <tr><td style="padding:36px 32px;">
          <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;">Week of</p>
          <h1 style="margin:0 0 28px;font-size:20px;font-weight:700;color:#111827;">${escapeHtml(digest.weekLabel)}</h1>

          <!-- Stats grid -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              ${stats.map(s => `
              <td style="width:25%;text-align:center;padding:16px 8px;background:#f8fafc;border-radius:12px;margin:4px;">
                <div style="font-size:26px;font-weight:800;color:#2563eb;">${escapeHtml(s.value)}</div>
                <div style="font-size:11px;color:#6b7280;margin-top:4px;">${escapeHtml(s.label)}</div>
              </td>`).join('<td style="width:8px;"></td>')}
            </tr>
          </table>

          ${digest.topLanguagePair ? `
          <div style="background:#eff6ff;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
            <span style="font-size:13px;color:#1d4ed8;font-weight:600;">🌐 Top language pair this week: </span>
            <span style="font-size:13px;color:#1e40af;">${escapeHtml(digest.topLanguagePair)}</span>
          </div>` : ''}

          <div style="text-align:center;">
            <a href="${APP_URL}/organization"
               style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
              View Full Analytics
            </a>
          </div>
        </td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            Sent weekly to org admins. Update preferences in <a href="${APP_URL}/settings" style="color:#6b7280;">Settings</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
  } catch (err) {
    console.error('[email-service] sendWeeklyDigestEmail failed:', err);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
