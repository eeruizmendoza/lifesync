/**
 * lib/email-oauth.ts
 * Phase 56 — Email OAuth helpers for Gmail and Outlook.
 *
 * Handles token exchange, refresh, and encryption/decryption.
 * Uses AES-256-GCM (same key as ENCRYPTION_MASTER_KEY) to store tokens.
 *
 * Required env vars (Gmail):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 *
 * Required env vars (Outlook):
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// ─── Token encryption ────────────────────────────────────────────────────────

function getMasterKey(): Buffer | null {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) return null;
  const buf = Buffer.from(key, 'base64');
  return buf.length === 32 ? buf : null;
}

export function encryptToken(plaintext: string): string | null {
  const key = getMasterKey();
  if (!key) return null;
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  } catch {
    return null;
  }
}

export function decryptToken(ciphertext: string): string | null {
  const key = getMasterKey();
  if (!key) return null;
  try {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv  = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// ─── Gmail OAuth ─────────────────────────────────────────────────────────────

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function hasGmailConfig(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGmailAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri:  process.env.GOOGLE_REDIRECT_URI ?? '',
    response_type: 'code',
    scope:         GMAIL_SCOPES.join(' '),
    access_type:   'offline',
    prompt:        'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGmailCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  email: string;
  displayName: string;
} | null> {
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri:  process.env.GOOGLE_REDIRECT_URI ?? '',
        grant_type:    'authorization_code',
      }).toString(),
    });
    if (!tokenRes.ok) return null;
    const tokens = await tokenRes.json() as {
      access_token: string; refresh_token?: string; expires_in: number;
    };

    // Fetch user email
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) return null;
    const userInfo = await userRes.json() as { email: string; name: string };

    return {
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt:    new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      email:        userInfo.email,
      displayName:  userInfo.name ?? userInfo.email,
    };
  } catch {
    return null;
  }
}

export async function refreshGmailToken(refreshToken: string): Promise<{
  accessToken: string; expiresAt: Date;
} | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id:     process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        grant_type:    'refresh_token',
      }).toString(),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; expires_in: number };
    return {
      accessToken: data.access_token,
      expiresAt:   new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    };
  } catch {
    return null;
  }
}

// ─── Outlook OAuth ───────────────────────────────────────────────────────────

const OUTLOOK_SCOPES = [
  'openid', 'profile', 'email', 'offline_access',
  'Mail.Read', 'Mail.Send',
];

export function hasOutlookConfig(): boolean {
  return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export function getOutlookAuthUrl(state: string): string {
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? 'common';
  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID ?? '',
    redirect_uri:  process.env.MICROSOFT_REDIRECT_URI ?? '',
    response_type: 'code',
    scope:         OUTLOOK_SCOPES.join(' '),
    state,
  });
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeOutlookCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  email: string;
  displayName: string;
} | null> {
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? 'common';
  try {
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id:     process.env.MICROSOFT_CLIENT_ID ?? '',
          client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
          redirect_uri:  process.env.MICROSOFT_REDIRECT_URI ?? '',
          grant_type:    'authorization_code',
          scope:         OUTLOOK_SCOPES.join(' '),
        }).toString(),
      },
    );
    if (!tokenRes.ok) return null;
    const tokens = await tokenRes.json() as {
      access_token: string; refresh_token?: string; expires_in: number;
    };

    // Get user info from Microsoft Graph
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!meRes.ok) return null;
    const me = await meRes.json() as { mail?: string; userPrincipalName?: string; displayName?: string };

    return {
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt:    new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      email:        me.mail ?? me.userPrincipalName ?? '',
      displayName:  me.displayName ?? me.mail ?? '',
    };
  } catch {
    return null;
  }
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

export type EmailProvider = 'gmail' | 'outlook';

export interface ConnectedAccount {
  id: string;
  provider: EmailProvider;
  email: string;
  displayName: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
}
