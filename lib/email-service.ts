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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
