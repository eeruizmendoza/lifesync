/**
 * GET  /api/keys — list active API keys for the org (prefix + metadata, NOT full key)
 * POST /api/keys — generate a new API key; returns full key ONCE, then never again
 *
 * Body (POST): { name: string, expiresInDays?: number }
 * Response (POST): { id, name, key, prefix, createdAt }
 *   `key` = full plaintext key — display once, never stored again
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';
import { requireAdminRole } from '@/lib/tenant-middleware';

export const dynamic = 'force-dynamic';

function generateApiKey(): { full: string; prefix: string; hash: string } {
  // Full key: ls_live_ + 40 random hex chars  → 48 chars total
  const random = crypto.randomBytes(20).toString('hex');
  const full = `ls_live_${random}`;
  const prefix = full.slice(0, 14); // "ls_live_" + first 6 hex chars
  const hash = crypto.createHash('sha256').update(full).digest('hex');
  return { full, prefix, hash };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });
    const roleErr = await requireAdminRole(user);
    if (roleErr) return roleErr;

    const sql = neon(process.env.DATABASE_URL!);

    const keys = await sql`
      SELECT
        k.id,
        k.name,
        k.key_prefix,
        k.last_used_at,
        k.expires_at,
        k.created_at,
        u.name AS created_by_name,
        u.phone_number AS created_by_phone
      FROM api_keys k
      JOIN users u ON u.id = k.created_by
      WHERE k.org_id = ${user.orgId}::uuid
        AND k.revoked_at IS NULL
      ORDER BY k.created_at DESC
    `;

    return NextResponse.json({
      ok: true,
      keys: keys.map(k => ({
        id: String(k.id),
        name: String(k.name),
        prefix: String(k.key_prefix),
        lastUsedAt: k.last_used_at ? new Date(String(k.last_used_at)).toISOString() : null,
        expiresAt: k.expires_at ? new Date(String(k.expires_at)).toISOString() : null,
        createdAt: new Date(String(k.created_at)).toISOString(),
        createdBy: String(k.created_by_name ?? k.created_by_phone ?? 'Unknown'),
      })),
    });
  } catch (err) {
    console.error('[api/keys GET]', err);
    return NextResponse.json({ error: 'Failed to list keys' }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });
    const roleErr = await requireAdminRole(user);
    if (roleErr) return roleErr;

    const body = await req.json().catch(() => ({}));
    const { name, expiresInDays } = body as { name?: string; expiresInDays?: number };

    if (!name || name.trim().length < 2 || name.trim().length > 100) {
      return NextResponse.json({ error: 'Key name must be 2–100 characters' }, { status: 400 });
    }

    // Limit: 10 active keys per org
    const sql = neon(process.env.DATABASE_URL!);
    const [countRow] = await sql`
      SELECT COUNT(*)::int AS cnt FROM api_keys
      WHERE org_id = ${user.orgId}::uuid AND revoked_at IS NULL
    `;
    if ((countRow?.cnt ?? 0) >= 10) {
      return NextResponse.json({ error: 'Maximum of 10 active API keys per organization' }, { status: 422 });
    }

    const { full, prefix, hash } = generateApiKey();

    let expiresAt: string | null = null;
    if (expiresInDays && expiresInDays > 0 && expiresInDays <= 365) {
      const d = new Date();
      d.setDate(d.getDate() + expiresInDays);
      expiresAt = d.toISOString();
    }

    const [newKey] = await sql`
      INSERT INTO api_keys (org_id, created_by, name, key_prefix, key_hash, expires_at)
      VALUES (
        ${user.orgId}::uuid,
        ${user.id}::uuid,
        ${name.trim()},
        ${prefix},
        ${hash},
        ${expiresAt ? expiresAt : null}
      )
      RETURNING id, name, key_prefix, expires_at, created_at
    `;

    // Return full key ONCE — never stored, never retrievable again
    return NextResponse.json({
      ok: true,
      id: String(newKey.id),
      name: String(newKey.name),
      key: full,            // ← shown once only
      prefix,
      expiresAt: newKey.expires_at ? new Date(String(newKey.expires_at)).toISOString() : null,
      createdAt: new Date(String(newKey.created_at)).toISOString(),
    }, { status: 201 });
  } catch (err) {
    console.error('[api/keys POST]', err);
    return NextResponse.json({ error: 'Failed to create key' }, { status: 500 });
  }
}
