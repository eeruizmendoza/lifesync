/**
 * audit-log.ts
 * Write security and compliance events to org_audit_log.
 * All functions are fire-and-forget safe (catch internally, never throw).
 */

import { neon } from '@neondatabase/serverless';

export type AuditEventType =
  | 'api_key.created'
  | 'api_key.revoked'
  | 'webhook.created'
  | 'webhook.deleted'
  | 'webhook.toggled'
  | 'webhook.tested'
  | 'member.invited'
  | 'member.joined'
  | 'member.removed'
  | 'member.role_changed'
  | 'org.settings_updated'
  | 'org.plan_changed'
  | 'recording.accessed'
  | 'recording.deleted'
  | 'org.created';

export interface AuditLogEntry {
  orgId: string;
  actorId?: string | null;
  actorName?: string | null;
  eventType: AuditEventType;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      INSERT INTO org_audit_log
        (org_id, actor_id, actor_name, event_type, target_type, target_id, target_name, metadata)
      VALUES (
        ${entry.orgId}::uuid,
        ${entry.actorId ?? null}::uuid,
        ${entry.actorName ?? null},
        ${entry.eventType},
        ${entry.targetType ?? null},
        ${entry.targetId ?? null},
        ${entry.targetName ?? null},
        ${entry.metadata ? JSON.stringify(entry.metadata) : null}
      )
    `;
  } catch {
    // Non-fatal — audit failures must never break the primary action
  }
}
