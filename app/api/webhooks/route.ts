/**
 * GET  /api/webhooks  — list org webhook endpoints
 * POST /api/webhooks  — register a new webhook endpoint
 *
 * Supported event types: call.completed | call.missed | recording.ready | member.joined | quota.warning
 * Pass events: [] to subscribe to ALL events.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const VALID_EVENTS = new Set([
  'call.completed',
  'call.missed',
  'recording.ready',
  'member.joined',
  'quota.warning',
]);

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);

    const endpoints = await sql`
      SELECT
        w.id,
        w.url,
        w.description,
        w.events,
        w.is_active,
        w.last_triggered_at,
        w.last_status_code,
        w.failure_count,
        w.created_at,
        u.name AS created_by_name,
        u.phone_number AS created_by_phone,
        (SELECT COUNT(*) FROM webhook_deliveries d WHERE d.endpoint_id = w.id) AS total_deliveries,
        (SELECT COUNT(*) FROM webhook_deliveries d WHERE d.endpoint_id = w.id AND d.success = TRUE) AS successful_deliveries
      FROM webhook_endpoints w
      JOIN users u ON u.id = w.created_by
      WHERE w.org_id = ${user.orgId}::uuid
      ORDER BY w.created_at DESC
    `;

    return NextResponse.json({
      ok: true,
      endpoints: endpoints.map(w => ({
        id: String(w.id),
        url: String(w.url),
        description: w.description ? String(w.description) : null,
        events: (w.events as string[]) ?? [],
        isActive: Boolean(w.is_active),
        lastTriggeredAt: w.last_triggered_at ? new Date(String(w.last_triggered_at)).toISOString() : null,
        lastStatusCode: w.last_status_code ? Number(w.last_status_code) : null,
        failureCount: Number(w.failure_count ?? 0),
        createdAt: new Date(String(w.created_at)).toISOString(),
        createdBy: String(w.created_by_name ?? w.created_by_phone ?? 'Unknown'),
        totalDeliveries: Number(w.total_deliveries ?? 0),
        successfulDeliveries: Number(w.successful_deliveries ?? 0),
      })),
    });
  } catch (err) {
    console.error('[api/webhooks GET]', err);
    return NextResponse.json({ error: 'Failed to list webhooks' }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const { url, description, events } = body as {
      url?: string;
      description?: string;
      events?: string[];
    };

    if (!url || url.trim().length < 10) {
      return NextResponse.json({ error: 'Valid URL is required' }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'URL must use http or https' }, { status: 400 });
    }

    // Validate event types
    const eventList = Array.isArray(events) ? events : [];
    const invalidEvents = eventList.filter(e => !VALID_EVENTS.has(e));
    if (invalidEvents.length > 0) {
      return NextResponse.json({ error: `Invalid event types: ${invalidEvents.join(', ')}` }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Limit 20 endpoints per org
    const [countRow] = await sql`
      SELECT COUNT(*)::int AS cnt FROM webhook_endpoints WHERE org_id = ${user.orgId}::uuid
    `;
    if ((countRow?.cnt ?? 0) >= 20) {
      return NextResponse.json({ error: 'Maximum of 20 webhook endpoints per organization' }, { status: 422 });
    }

    // Generate signing secret
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

    const [newEndpoint] = await sql`
      INSERT INTO webhook_endpoints (org_id, created_by, url, description, events, secret)
      VALUES (
        ${user.orgId}::uuid,
        ${user.id}::uuid,
        ${parsedUrl.toString()},
        ${description?.trim() || null},
        ${sql.array(eventList.length > 0 ? eventList : [], 'text')},
        ${secret}
      )
      RETURNING id, url, description, events, is_active, created_at
    `;

    return NextResponse.json({
      ok: true,
      endpoint: {
        id: String(newEndpoint.id),
        url: String(newEndpoint.url),
        description: newEndpoint.description ? String(newEndpoint.description) : null,
        events: (newEndpoint.events as string[]) ?? [],
        isActive: Boolean(newEndpoint.is_active),
        createdAt: new Date(String(newEndpoint.created_at)).toISOString(),
      },
      secret, // shown once, never stored in plaintext again
    }, { status: 201 });
  } catch (err) {
    console.error('[api/webhooks POST]', err);
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
  }
}
