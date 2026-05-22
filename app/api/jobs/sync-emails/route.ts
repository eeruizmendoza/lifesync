/**
 * POST /api/jobs/sync-emails
 * Phase 56 — Fetch recent emails from connected Gmail/Outlook accounts,
 * translate to user's language, and store in universal messages table.
 *
 * Runs every 15 minutes via Vercel Cron.
 * Processes up to 10 messages per account per run.
 *
 * Gmail: fetches via /gmail/v1/users/me/messages
 * Outlook: fetches via /v1.0/me/messages
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import {
  decryptToken, encryptToken,
  refreshGmailToken,
} from '@/lib/email-oauth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function tryTranslate(text: string, sourceLang: string, targetLang: string): Promise<string | null> {
  if (!process.env.DEEPL_API_KEY || sourceLang === targetLang || !text.trim()) return null;
  try {
    const res = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        text: text.slice(0, 5000),
        source_lang: sourceLang.toUpperCase(),
        target_lang: targetLang.toUpperCase(),
      }).toString(),
      signal: AbortSignal.timeout(8_000),
    });
    const data = await res.json() as { translations?: { text: string }[] };
    return data?.translations?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

// Refresh expired Gmail token and update DB
async function ensureFreshGmailToken(
  sql: ReturnType<typeof neon>,
  account: any,
): Promise<string | null> {
  const now = new Date();
  const expiresAt = account.token_expires_at ? new Date(String(account.token_expires_at)) : null;
  const isExpired = !expiresAt || expiresAt <= new Date(now.getTime() + 60_000);

  if (!isExpired) {
    return decryptToken(String(account.access_token));
  }

  const refreshEncrypted = account.refresh_token ? String(account.refresh_token) : null;
  if (!refreshEncrypted) return null;

  const refreshToken = decryptToken(refreshEncrypted);
  if (!refreshToken) return null;

  const refreshed = await refreshGmailToken(refreshToken);
  if (!refreshed) return null;

  const newEncrypted = encryptToken(refreshed.accessToken);
  if (!newEncrypted) return null;

  await sql`
    UPDATE connected_accounts
    SET access_token = ${newEncrypted}, token_expires_at = ${refreshed.expiresAt.toISOString()}, updated_at = NOW()
    WHERE id = ${String(account.id)}::uuid
  `.catch(() => {});

  return refreshed.accessToken;
}

// Fetch and import Gmail messages
async function syncGmail(sql: ReturnType<typeof neon>, account: any, userLanguage: string): Promise<number> {
  const accessToken = await ensureFreshGmailToken(sql, account);
  if (!accessToken) return 0;

  const accountId = String(account.id);
  const userId    = String(account.user_id);
  let imported    = 0;

  try {
    // List recent messages (unread or from last 24h)
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=in:inbox is:unread',
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!listRes.ok) return 0;
    const listData = await listRes.json() as { messages?: { id: string }[] };
    const messages = listData.messages ?? [];

    for (const msg of messages) {
      // Check if already imported
      const existing = await sql`
        SELECT id FROM email_sync_log WHERE account_id = ${accountId}::uuid AND external_id = ${msg.id} LIMIT 1
      `.catch(() => []);
      if ((existing as any[]).length > 0) continue;

      // Fetch full message
      const fullRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8_000) },
      );
      if (!fullRes.ok) continue;
      const full = await fullRes.json() as {
        payload?: { headers?: { name: string; value: string }[]; body?: { data?: string }; parts?: any[] };
        snippet?: string;
      };

      const headers = full.payload?.headers ?? [];
      const subject = headers.find(h => h.name === 'Subject')?.value ?? '(no subject)';
      const from    = headers.find(h => h.name === 'From')?.value ?? '';

      // Extract body (prefer text/plain)
      let bodyText = full.snippet ?? '';
      const parts = full.payload?.parts ?? [];
      const textPart = parts.find(p => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        try {
          bodyText = Buffer.from(textPart.body.data, 'base64').toString('utf-8').slice(0, 3000);
        } catch {}
      } else if (full.payload?.body?.data) {
        try {
          bodyText = Buffer.from(full.payload.body.data, 'base64').toString('utf-8').slice(0, 3000);
        } catch {}
      }

      const content = `**${subject}**\nFrom: ${from}\n\n${bodyText}`.trim();
      const translated = await tryTranslate(content, 'en', userLanguage);

      // Store message
      await sql`
        INSERT INTO messages (
          receiver_user_id, channel, direction, status,
          content, translated_content, language, target_language,
          external_message_id
        ) VALUES (
          ${userId}::uuid, 'email', 'inbound', 'delivered',
          ${content}, ${translated}, 'en', ${userLanguage},
          ${msg.id}
        )
      `.catch(() => {});

      // Mark as synced
      await sql`
        INSERT INTO email_sync_log (account_id, external_id) VALUES (${accountId}::uuid, ${msg.id})
        ON CONFLICT DO NOTHING
      `.catch(() => {});

      imported++;
    }
  } catch (err) {
    console.error('[sync-emails/gmail]', err);
  }

  return imported;
}

// Fetch and import Outlook messages
async function syncOutlook(sql: ReturnType<typeof neon>, account: any, userLanguage: string): Promise<number> {
  const accessToken = decryptToken(String(account.access_token));
  if (!accessToken) return 0;

  const accountId = String(account.id);
  const userId    = String(account.user_id);
  let imported    = 0;

  try {
    const listRes = await fetch(
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=10&$filter=isRead eq false&$select=id,subject,from,bodyPreview,body,receivedDateTime',
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!listRes.ok) return 0;
    const listData = await listRes.json() as { value?: any[] };
    const messages = listData.value ?? [];

    for (const msg of messages) {
      const existing = await sql`
        SELECT id FROM email_sync_log WHERE account_id = ${accountId}::uuid AND external_id = ${String(msg.id)} LIMIT 1
      `.catch(() => []);
      if ((existing as any[]).length > 0) continue;

      const subject = msg.subject ?? '(no subject)';
      const from    = msg.from?.emailAddress?.address ?? '';
      const bodyText = (msg.bodyPreview ?? '').slice(0, 3000);
      const content  = `**${subject}**\nFrom: ${from}\n\n${bodyText}`.trim();
      const translated = await tryTranslate(content, 'en', userLanguage);

      await sql`
        INSERT INTO messages (
          receiver_user_id, channel, direction, status,
          content, translated_content, language, target_language,
          external_message_id
        ) VALUES (
          ${userId}::uuid, 'email', 'inbound', 'delivered',
          ${content}, ${translated}, 'en', ${userLanguage},
          ${String(msg.id)}
        )
      `.catch(() => {});

      await sql`
        INSERT INTO email_sync_log (account_id, external_id) VALUES (${accountId}::uuid, ${String(msg.id)})
        ON CONFLICT DO NOTHING
      `.catch(() => {});

      imported++;
    }
  } catch (err) {
    console.error('[sync-emails/outlook]', err);
  }

  return imported;
}

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret')
    ?? request.headers.get('authorization')?.replace('Bearer ', '');
  if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // Ensure tables exist
  await sql`
    CREATE TABLE IF NOT EXISTS connected_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL, provider TEXT NOT NULL, email TEXT NOT NULL,
      display_name TEXT, access_token TEXT NOT NULL, refresh_token TEXT,
      token_expires_at TIMESTAMPTZ, scopes TEXT[], is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_synced_at TIMESTAMPTZ, sync_cursor TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, provider, email)
    )
  `.catch(() => {});

  await sql`
    CREATE TABLE IF NOT EXISTS email_sync_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL, external_id TEXT NOT NULL, imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (account_id, external_id)
    )
  `.catch(() => {});

  const accounts = await sql`
    SELECT ca.*, u.language_preference AS user_language
    FROM connected_accounts ca
    JOIN users u ON u.id = ca.user_id
    WHERE ca.is_active = TRUE
    LIMIT 100
  `.catch(() => []);

  let totalImported = 0;
  const results: { accountId: string; provider: string; imported: number }[] = [];

  for (const account of accounts as any[]) {
    const lang = account.user_language ? String(account.user_language) : 'en';
    let imported = 0;

    if (String(account.provider) === 'gmail') {
      imported = await syncGmail(sql, account, lang);
    } else if (String(account.provider) === 'outlook') {
      imported = await syncOutlook(sql, account, lang);
    }

    if (imported > 0) {
      await sql`
        UPDATE connected_accounts SET last_synced_at = NOW(), updated_at = NOW()
        WHERE id = ${String(account.id)}::uuid
      `.catch(() => {});
    }

    results.push({ accountId: String(account.id), provider: String(account.provider), imported });
    totalImported += imported;
  }

  return NextResponse.json({ ok: true, totalImported, accounts: results });
}
