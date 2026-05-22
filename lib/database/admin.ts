/**
 * Super-admin database queries.
 * These queries span all organizations — only callable by verified super-admins.
 */

import { neon } from '@neondatabase/serverless';

function db() {
  return neon(process.env.DATABASE_URL!);
}

export interface AdminOrgRow {
  id: string;
  name: string;
  slug: string;
  plan: 'trial' | 'starter' | 'pro' | 'enterprise';
  isActive: boolean;
  isSuspended: boolean;
  suspensionReason: string | null;
  memberCount: number;
  callsThisMonth: number;
  maxCallsPerMonth: number;
  storageUsedBytes: number;
  maxStorageBytes: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: Date;
  ownerPhone: string | null;
  ownerName: string | null;
}

export interface AdminPlatformStats {
  totalOrgs: number;
  activeOrgs: number;
  suspendedOrgs: number;
  totalUsers: number;
  trialOrgs: number;
  starterOrgs: number;
  proOrgs: number;
  enterpriseOrgs: number;
  totalCallsThisMonth: number;
  totalStorageBytes: number;
}

/**
 * List all organizations with membership counts and usage stats.
 */
export async function listAllOrgs(
  limit = 50,
  offset = 0,
  search?: string
): Promise<{ orgs: AdminOrgRow[]; total: number }> {
  const sql = db();

  const searchFilter = search
    ? `AND (o.name ILIKE ${'%' + search + '%'} OR o.slug ILIKE ${'%' + search + '%'})`
    : '';

  const countResult = await sql`
    SELECT COUNT(*) AS total
    FROM organizations o
    ${search ? sql`WHERE (o.name ILIKE ${'%' + search + '%'} OR o.slug ILIKE ${'%' + search + '%'})` : sql``}
  `;

  const total = parseInt(String(countResult[0]?.total ?? '0'), 10);

  const rows = await sql`
    SELECT
      o.id,
      o.name,
      o.slug,
      o.plan,
      o.is_active,
      o.is_suspended,
      o.suspension_reason,
      o.calls_this_month,
      o.max_calls_per_month,
      o.storage_used_bytes,
      o.max_storage_bytes,
      o.stripe_customer_id,
      o.stripe_subscription_id,
      o.created_at,
      COUNT(DISTINCT om.user_id)::int AS member_count,
      owner_u.phone_number AS owner_phone,
      owner_u.name AS owner_name
    FROM organizations o
    LEFT JOIN organization_members om ON om.org_id = o.id
    LEFT JOIN organization_members owner_m ON owner_m.org_id = o.id AND owner_m.role = 'owner'
    LEFT JOIN users owner_u ON owner_u.id::text = owner_m.user_id::text
    ${search ? sql`WHERE (o.name ILIKE ${'%' + search + '%'} OR o.slug ILIKE ${'%' + search + '%'})` : sql``}
    GROUP BY o.id, owner_u.phone_number, owner_u.name
    ORDER BY o.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const orgs: AdminOrgRow[] = rows.map(r => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    plan: r.plan as AdminOrgRow['plan'],
    isActive: Boolean(r.is_active),
    isSuspended: Boolean(r.is_suspended),
    suspensionReason: r.suspension_reason ? String(r.suspension_reason) : null,
    memberCount: Number(r.member_count ?? 0),
    callsThisMonth: Number(r.calls_this_month ?? 0),
    maxCallsPerMonth: Number(r.max_calls_per_month ?? 0),
    storageUsedBytes: Number(r.storage_used_bytes ?? 0),
    maxStorageBytes: Number(r.max_storage_bytes ?? 0),
    stripeCustomerId: r.stripe_customer_id ? String(r.stripe_customer_id) : null,
    stripeSubscriptionId: r.stripe_subscription_id ? String(r.stripe_subscription_id) : null,
    createdAt: new Date(String(r.created_at)),
    ownerPhone: r.owner_phone ? String(r.owner_phone) : null,
    ownerName: r.owner_name ? String(r.owner_name) : null,
  }));

  return { orgs, total };
}

/**
 * Platform-wide aggregate stats.
 */
export async function getPlatformStats(): Promise<AdminPlatformStats> {
  const sql = db();

  const rows = await sql`
    SELECT
      COUNT(*)::int                                         AS total_orgs,
      COUNT(*) FILTER (WHERE is_active AND NOT is_suspended)::int AS active_orgs,
      COUNT(*) FILTER (WHERE is_suspended)::int            AS suspended_orgs,
      COUNT(*) FILTER (WHERE plan = 'trial')::int          AS trial_orgs,
      COUNT(*) FILTER (WHERE plan = 'starter')::int        AS starter_orgs,
      COUNT(*) FILTER (WHERE plan = 'pro')::int            AS pro_orgs,
      COUNT(*) FILTER (WHERE plan = 'enterprise')::int     AS enterprise_orgs,
      COALESCE(SUM(calls_this_month), 0)::bigint           AS total_calls_this_month,
      COALESCE(SUM(storage_used_bytes), 0)::bigint         AS total_storage_bytes
    FROM organizations
  `;

  const userRow = await sql`SELECT COUNT(*)::int AS total FROM users`;

  const r = rows[0] ?? {};
  return {
    totalOrgs: Number(r.total_orgs ?? 0),
    activeOrgs: Number(r.active_orgs ?? 0),
    suspendedOrgs: Number(r.suspended_orgs ?? 0),
    totalUsers: Number(userRow[0]?.total ?? 0),
    trialOrgs: Number(r.trial_orgs ?? 0),
    starterOrgs: Number(r.starter_orgs ?? 0),
    proOrgs: Number(r.pro_orgs ?? 0),
    enterpriseOrgs: Number(r.enterprise_orgs ?? 0),
    totalCallsThisMonth: Number(r.total_calls_this_month ?? 0),
    totalStorageBytes: Number(r.total_storage_bytes ?? 0),
  };
}

/**
 * Update an organization's plan (admin override — bypasses Stripe).
 */
export async function adminSetOrgPlan(
  orgId: string,
  plan: 'trial' | 'starter' | 'pro' | 'enterprise'
): Promise<void> {
  const sql = db();
  const planLimits: Record<string, { maxUsers: number; maxCalls: number; maxStorage: number }> = {
    trial:      { maxUsers: 3,   maxCalls: 100,   maxStorage: 10 * 1024 * 1024 * 1024 },
    starter:    { maxUsers: 10,  maxCalls: 500,   maxStorage: 50 * 1024 * 1024 * 1024 },
    pro:        { maxUsers: 50,  maxCalls: 2000,  maxStorage: 200 * 1024 * 1024 * 1024 },
    enterprise: { maxUsers: 500, maxCalls: 10000, maxStorage: 1024 * 1024 * 1024 * 1024 },
  };
  const limits = planLimits[plan];
  await sql`
    UPDATE organizations
    SET plan = ${plan},
        max_users = ${limits.maxUsers},
        max_calls_per_month = ${limits.maxCalls},
        max_storage_bytes = ${limits.maxStorage},
        plan_started_at = NOW(),
        updated_at = NOW()
    WHERE id = ${orgId}
  `;
}

/**
 * Suspend or unsuspend an org.
 */
export async function adminSetOrgSuspension(
  orgId: string,
  suspended: boolean,
  reason?: string
): Promise<void> {
  const sql = db();
  await sql`
    UPDATE organizations
    SET is_suspended = ${suspended},
        suspension_reason = ${suspended ? (reason ?? 'Suspended by admin') : null},
        updated_at = NOW()
    WHERE id = ${orgId}
  `;
}
