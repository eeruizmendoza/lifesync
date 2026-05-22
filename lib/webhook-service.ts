/**
 * webhook-service.ts
 * Delivers signed webhook events to registered org endpoints.
 * HMAC-SHA256 signature in X-LifeSync-Signature header.
 * Fire-and-forget safe — all errors are caught internally.
 */

import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';

// ─── Types ───────────────────────────────────────────────────────────────────

export type WebhookEventType =
  | 'call.completed'
  | 'call.missed'
  | 'recording.ready'
  | 'member.joined'
  | 'quota.warning'
  | 'ping';

export interface WebhookPayload {
  id: string;           // unique event id
  type: WebhookEventType;
  orgId: string;
  createdAt: string;    // ISO
  data: Record<string, unknown>;
}

// ─── Signature ───────────────────────────────────────────────────────────────

export function signPayload(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// ─── Delivery ────────────────────────────────────────────────────────────────

async function deliverToEndpoint(
  endpoint: { id: string; url: string; secret: string },
  payload: WebhookPayload
): Promise<{ success: boolean; statusCode: number | null; durationMs: number }> {
  const body = JSON.stringify(payload);
  const sig = signPayload(body, endpoint.secret);
  const start = Date.now();

  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LifeSync-Signature': `sha256=${sig}`,
        'X-LifeSync-Event': payload.type,
        'X-LifeSync-Delivery': payload.id,
        'User-Agent': 'LifeSync-Webhooks/1.0',
      },
      body,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    return {
      success: res.ok,
      statusCode: res.status,
      durationMs: Date.now() - start,
    };
  } catch {
    return { success: false, statusCode: null, durationMs: Date.now() - start };
  }
}

// ─── Main: deliver to all org endpoints subscribed to this event ──────────────

export async function deliverWebhookEvent(
  orgId: string,
  eventType: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);

  // Fetch active endpoints subscribed to this event type
  const endpoints = await sql`
    SELECT id, url, secret
    FROM webhook_endpoints
    WHERE org_id = ${orgId}::uuid
      AND is_active = TRUE
      AND (events = '{}' OR ${eventType} = ANY(events))
  `;

  if (endpoints.length === 0) return;

  const payload: WebhookPayload = {
    id: crypto.randomUUID(),
    type: eventType,
    orgId,
    createdAt: new Date().toISOString(),
    data,
  };

  // Deliver to all endpoints in parallel
  const results = await Promise.all(
    endpoints.map(ep =>
      deliverToEndpoint(
        { id: String(ep.id), url: String(ep.url), secret: String(ep.secret) },
        payload
      ).then(result => ({ ep, ...result }))
    )
  );

  // Persist delivery log and update endpoint stats
  await Promise.all(
    results.map(async ({ ep, success, statusCode, durationMs }) => {
      await sql`
        INSERT INTO webhook_deliveries
          (endpoint_id, org_id, event_type, payload, status_code, duration_ms, success)
        VALUES
          (${ep.id}::uuid, ${orgId}::uuid, ${eventType}, ${JSON.stringify(payload.data)},
           ${statusCode}, ${durationMs}, ${success})
      `;

      if (success) {
        await sql`
          UPDATE webhook_endpoints
          SET last_triggered_at = NOW(), last_status_code = ${statusCode}, failure_count = 0
          WHERE id = ${ep.id}::uuid
        `;
      } else {
        await sql`
          UPDATE webhook_endpoints
          SET last_triggered_at = NOW(), last_status_code = ${statusCode},
              failure_count = failure_count + 1,
              is_active = CASE WHEN failure_count + 1 >= 10 THEN FALSE ELSE is_active END
          WHERE id = ${ep.id}::uuid
        `;
      }
    })
  );
}
