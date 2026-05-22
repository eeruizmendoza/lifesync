/**
 * lib/twilio-sms.ts
 * Phase 55 — Twilio SMS Integration
 *
 * Sends and validates Twilio SMS messages.
 * Gracefully no-ops when TWILIO_* env vars are not configured.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID   — Twilio account SID (starts with AC...)
 *   TWILIO_AUTH_TOKEN    — Twilio auth token
 *   TWILIO_PHONE_NUMBER  — E.164 format, e.g. +15550001234
 */

export interface SMSResult {
  ok: boolean;
  sid?: string;        // Twilio message SID
  error?: string;
}

/**
 * Returns true if Twilio credentials are configured.
 */
export function hasTwilio(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

/**
 * Send an SMS via Twilio REST API.
 * Uses raw fetch to avoid pulling in the Twilio SDK.
 */
export async function sendSMS(to: string, body: string): Promise<SMSResult> {
  const accountSid  = process.env.TWILIO_ACCOUNT_SID;
  const authToken   = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber  = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, error: 'Twilio not configured' };
  }

  // Validate E.164 format
  const normalizedTo = to.startsWith('+') ? to : `+${to.replace(/\D/g, '')}`;
  if (!/^\+\d{7,15}$/.test(normalizedTo)) {
    return { ok: false, error: 'Invalid phone number format' };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const params = new URLSearchParams({
      From: fromNumber,
      To:   normalizedTo,
      Body: body.slice(0, 1600), // Twilio max per-message
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json() as { sid?: string; message?: string; code?: number };

    if (!res.ok) {
      return { ok: false, error: data.message ?? `Twilio error ${res.status}` };
    }

    return { ok: true, sid: data.sid };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/**
 * Validate a Twilio webhook signature to prevent spoofed incoming SMS.
 * Uses HMAC-SHA1 of the full request URL + sorted POST params.
 *
 * Returns true if the signature is valid (or if TWILIO_AUTH_TOKEN not set — dev mode).
 */
export async function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return true; // Skip validation in dev

  try {
    const { createHmac } = await import('crypto');

    // Sort params and concatenate to URL
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
      data += key + (params[key] ?? '');
    }

    const expected = createHmac('sha1', authToken).update(data).digest('base64');
    return expected === signature;
  } catch {
    return false;
  }
}

/**
 * Normalize a phone number to E.164 format for comparison.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('1') && digits.length === 11
    ? `+${digits}`
    : digits.length === 10
    ? `+1${digits}`
    : `+${digits}`;
}
