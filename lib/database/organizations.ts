/**
 * Organization Database Utilities
 * Phase 3: Multi-Tenant SaaS Architecture
 *
 * All queries are org-scoped. Never return data across org boundaries.
 */

import { neon } from '@neondatabase/serverless';
import * as crypto from 'crypto';

function db() {
  return neon(process.env.DATABASE_URL!);
}

// ============================================================================
// Types
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  plan: 'trial' | 'starter' | 'pro' | 'enterprise';
  planStartedAt: Date | null;
  planExpiresAt: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  maxUsers: number;
  maxStorageBytes: number;
  maxCallsPerMonth: number;
  callsThisMonth: number;
  storageUsedBytes: number;
  isActive: boolean;
  isSuspended: boolean;
  suspensionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: Date;
  // Joined from users table
  name?: string;
  email?: string;
  avatarUrl?: string | null;
}

export interface OrgInvite {
  id: string;
  orgId: string;
  invitedBy: string;
  email: string;
  role: string;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface PlanLimits {
  plan: string;
  displayName: string;
  priceMonthly: number;   // dollars
  maxUsers: number;       // -1 = unlimited
  maxStorageBytes: number; // -1 = unlimited
  maxCallsPerMonth: number; // -1 = unlimited
  features: string[];
}

// ============================================================================
// Organization CRUD
// ============================================================================

/** Create a new organization and make the creator the owner. */
export async function createOrganization(
  name: string,
  creatorUserId: string,
  plan: Organization['plan'] = 'trial'
): Promise<Organization> {
  const sql = db();
  const slug = await generateUniqueSlug(name);

  const [org] = await sql`
    INSERT INTO organizations (name, slug, plan, plan_started_at)
    VALUES (${name}, ${slug}, ${plan}, NOW())
    RETURNING *
  `;

  // Add creator as owner
  await sql`
    INSERT INTO organization_members (org_id, user_id, role)
    VALUES (${org.id}, ${creatorUserId}, 'owner')
  `;

  // Set user's primary org
  await sql`
    UPDATE users SET org_id = ${org.id} WHERE id = ${creatorUserId}::uuid
  `;

  return mapOrg(org);
}

/** Get organization by ID. Returns null if not found or inactive. */
export async function getOrganizationById(orgId: string): Promise<Organization | null> {
  const sql = db();
  const rows = await sql`
    SELECT * FROM organizations WHERE id = ${orgId}::uuid AND is_active = true
  `;
  return rows.length > 0 ? mapOrg(rows[0]) : null;
}

/** Get organization by slug (for public-facing URLs). */
export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const sql = db();
  const rows = await sql`
    SELECT * FROM organizations WHERE slug = ${slug} AND is_active = true
  `;
  return rows.length > 0 ? mapOrg(rows[0]) : null;
}

/** Get the organization a user belongs to (their primary org). */
export async function getUserOrganization(userId: string): Promise<Organization | null> {
  const sql = db();
  const rows = await sql`
    SELECT o.* FROM organizations o
    JOIN organization_members om ON om.org_id = o.id
    WHERE om.user_id = ${userId}::uuid AND o.is_active = true
    ORDER BY om.joined_at ASC
    LIMIT 1
  `;
  return rows.length > 0 ? mapOrg(rows[0]) : null;
}

/** Update organization settings (name, logo, website). */
export async function updateOrganization(
  orgId: string,
  updates: Partial<Pick<Organization, 'name' | 'logoUrl' | 'website'>>
): Promise<void> {
  const sql = db();
  if (updates.name) {
    await sql`UPDATE organizations SET name = ${updates.name}, updated_at = NOW() WHERE id = ${orgId}::uuid`;
  }
  if (updates.logoUrl !== undefined) {
    await sql`UPDATE organizations SET logo_url = ${updates.logoUrl}, updated_at = NOW() WHERE id = ${orgId}::uuid`;
  }
  if (updates.website !== undefined) {
    await sql`UPDATE organizations SET website = ${updates.website}, updated_at = NOW() WHERE id = ${orgId}::uuid`;
  }
}

/** Update organization plan after Stripe webhook confirms subscription. */
export async function updateOrganizationPlan(
  orgId: string,
  plan: Organization['plan'],
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  stripePriceId: string
): Promise<void> {
  const sql = db();
  const limits = await getPlanLimits(plan);
  await sql`
    UPDATE organizations SET
      plan = ${plan},
      plan_started_at = NOW(),
      plan_expires_at = NULL,
      stripe_customer_id = ${stripeCustomerId},
      stripe_subscription_id = ${stripeSubscriptionId},
      stripe_price_id = ${stripePriceId},
      max_users = ${limits.maxUsers},
      max_storage_bytes = ${limits.maxStorageBytes === -1 ? 1099511627776 : limits.maxStorageBytes},
      max_calls_per_month = ${limits.maxCallsPerMonth === -1 ? 999999 : limits.maxCallsPerMonth},
      updated_at = NOW()
    WHERE id = ${orgId}::uuid
  `;
}

/** Suspend or unsuspend an organization. */
export async function setOrganizationSuspended(
  orgId: string,
  suspended: boolean,
  reason?: string
): Promise<void> {
  const sql = db();
  await sql`
    UPDATE organizations SET
      is_suspended = ${suspended},
      suspension_reason = ${reason ?? null},
      updated_at = NOW()
    WHERE id = ${orgId}::uuid
  `;
}

// ============================================================================
// Members
// ============================================================================

/** List all members of an organization. */
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const sql = db();
  const rows = await sql`
    SELECT om.*, u.name, u.email, u.avatar_url
    FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE om.org_id = ${orgId}::uuid
    ORDER BY om.joined_at ASC
  `;
  return rows.map(mapMember);
}

/** Get a specific member's role in an org. */
export async function getOrgMember(orgId: string, userId: string): Promise<OrgMember | null> {
  const sql = db();
  const rows = await sql`
    SELECT om.*, u.name, u.email, u.avatar_url
    FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE om.org_id = ${orgId}::uuid AND om.user_id = ${userId}::uuid
  `;
  return rows.length > 0 ? mapMember(rows[0]) : null;
}

/** Check if a user is a member of an org (any role). */
export async function isOrgMember(orgId: string, userId: string): Promise<boolean> {
  const sql = db();
  const rows = await sql`
    SELECT 1 FROM organization_members
    WHERE org_id = ${orgId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `;
  return rows.length > 0;
}

/** Check if user has at least a given role (owner > admin > member > viewer). */
export async function hasOrgRole(
  orgId: string,
  userId: string,
  minRole: 'owner' | 'admin' | 'member' | 'viewer'
): Promise<boolean> {
  const member = await getOrgMember(orgId, userId);
  if (!member) return false;
  const hierarchy = { owner: 4, admin: 3, member: 2, viewer: 1 };
  return hierarchy[member.role] >= hierarchy[minRole];
}

/** Update a member's role. */
export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: OrgMember['role']
): Promise<void> {
  const sql = db();
  await sql`
    UPDATE organization_members SET role = ${role}
    WHERE org_id = ${orgId}::uuid AND user_id = ${userId}::uuid
  `;
}

/** Remove a member from an org. */
export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  const sql = db();
  await sql`
    DELETE FROM organization_members
    WHERE org_id = ${orgId}::uuid AND user_id = ${userId}::uuid
  `;
}

// ============================================================================
// Invites
// ============================================================================

/** Create an invite token for an email address. */
export async function createOrgInvite(
  orgId: string,
  invitedByUserId: string,
  email: string,
  role: OrgMember['role'] = 'member'
): Promise<OrgInvite> {
  const sql = db();
  const token = crypto.randomBytes(32).toString('hex');
  const [invite] = await sql`
    INSERT INTO organization_invites (org_id, invited_by, email, role, token)
    VALUES (${orgId}::uuid, ${invitedByUserId}::uuid, ${email.toLowerCase()}, ${role}, ${token})
    ON CONFLICT (org_id, email) DO UPDATE SET
      token = ${token},
      role = ${role},
      expires_at = NOW() + INTERVAL '7 days',
      accepted_at = NULL,
      created_at = NOW()
    RETURNING *
  `;
  return mapInvite(invite);
}

/** Look up an invite by token (for the accept-invite flow). */
export async function getInviteByToken(token: string): Promise<OrgInvite | null> {
  const sql = db();
  const rows = await sql`
    SELECT * FROM organization_invites
    WHERE token = ${token}
      AND expires_at > NOW()
      AND accepted_at IS NULL
  `;
  return rows.length > 0 ? mapInvite(rows[0]) : null;
}

/** Accept an invite — adds user to org and marks invite used. */
export async function acceptOrgInvite(token: string, userId: string): Promise<void> {
  const sql = db();
  const invite = await getInviteByToken(token);
  if (!invite) throw new Error('Invite not found or expired');

  await sql`
    INSERT INTO organization_members (org_id, user_id, role, invited_by)
    VALUES (${invite.orgId}::uuid, ${userId}::uuid, ${invite.role}, (
      SELECT invited_by FROM organization_invites WHERE token = ${token}
    ))
    ON CONFLICT (org_id, user_id) DO NOTHING
  `;

  await sql`
    UPDATE organization_invites SET accepted_at = NOW() WHERE token = ${token}
  `;

  // Set as primary org if user has no org yet
  await sql`
    UPDATE users SET org_id = ${invite.orgId}::uuid
    WHERE id = ${userId}::uuid AND org_id IS NULL
  `;
}

/** List pending invites for an org. */
export async function listOrgInvites(orgId: string): Promise<OrgInvite[]> {
  const sql = db();
  const rows = await sql`
    SELECT * FROM organization_invites
    WHERE org_id = ${orgId}::uuid AND accepted_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC
  `;
  return rows.map(mapInvite);
}

// ============================================================================
// Usage / Quotas
// ============================================================================

/** Get plan limits for a plan name. */
export async function getPlanLimits(plan: string): Promise<PlanLimits> {
  const sql = db();
  const rows = await sql`SELECT * FROM plan_limits WHERE plan = ${plan}`;
  if (rows.length === 0) throw new Error(`Unknown plan: ${plan}`);
  return mapPlanLimits(rows[0]);
}

/** Increment the org's monthly call counter. */
export async function incrementOrgCallCount(orgId: string): Promise<void> {
  const sql = db();
  await sql`
    UPDATE organizations SET calls_this_month = calls_this_month + 1, updated_at = NOW()
    WHERE id = ${orgId}::uuid
  `;
  // Fire quota check asynchronously — non-blocking, non-fatal
  notifyOrgQuotaIfNeeded(orgId).catch(() => {});
}

/**
 * Check whether the org is approaching or has hit a quota threshold (80% / 100%).
 * If so, insert a quota_warning notification for all org admins/owners — but only
 * if no such notification was created in the last 6 hours to avoid spam.
 */
export async function notifyOrgQuotaIfNeeded(orgId: string): Promise<void> {
  const sql = db();

  const [org] = await sql`
    SELECT
      o.id,
      o.name,
      o.calls_this_month,
      o.storage_used_bytes,
      pl.max_calls_per_month,
      pl.max_storage_bytes
    FROM organizations o
    JOIN plan_limits pl ON pl.plan = o.plan
    WHERE o.id = ${orgId}::uuid
  `;
  if (!org) return;

  const warnings: string[] = [];

  // Calls threshold
  if (org.max_calls_per_month > 0) {
    const pct = org.calls_this_month / org.max_calls_per_month;
    if (pct >= 1.0) {
      warnings.push(`Your organization has reached its monthly call limit (${org.max_calls_per_month} calls). Upgrade to continue making calls.`);
    } else if (pct >= 0.8) {
      warnings.push(`Your organization has used ${Math.round(pct * 100)}% of its monthly call allowance (${org.calls_this_month} / ${org.max_calls_per_month} calls).`);
    }
  }

  // Storage threshold
  if (org.max_storage_bytes > 0) {
    const pct = org.storage_used_bytes / org.max_storage_bytes;
    if (pct >= 1.0) {
      const usedGB = (org.storage_used_bytes / 1e9).toFixed(1);
      const maxGB = (org.max_storage_bytes / 1e9).toFixed(0);
      warnings.push(`Storage limit reached (${usedGB}GB / ${maxGB}GB). Upgrade your plan or delete old recordings.`);
    } else if (pct >= 0.8) {
      const usedPct = Math.round(pct * 100);
      warnings.push(`You've used ${usedPct}% of your storage quota. Consider upgrading your plan.`);
    }
  }

  if (warnings.length === 0) return;

  // Dedup: skip if we already sent a quota_warning for this org in the last 6 hours
  const [recent] = await sql`
    SELECT 1 FROM user_notifications
    WHERE org_id = ${orgId}::uuid
      AND type = 'quota_warning'
      AND created_at > NOW() - INTERVAL '6 hours'
    LIMIT 1
  `;
  if (recent) return;

  // Notify all admins and owners
  const admins = await sql`
    SELECT user_id FROM organization_members
    WHERE org_id = ${orgId}::uuid
      AND role IN ('admin', 'owner')
  `;

  for (const admin of admins) {
    for (const msg of warnings) {
      await sql`
        INSERT INTO user_notifications (user_id, org_id, type, title, body, link)
        VALUES (
          ${admin.user_id}::uuid,
          ${orgId}::uuid,
          'quota_warning',
          ${'⚠️ Usage limit approaching — ' + (org.name as string)},
          ${msg},
          '/billing'
        )
      `;
    }
  }
}

/** Update storage used (recalculated from call_recordings). */
export async function recalcOrgStorage(orgId: string): Promise<number> {
  const sql = db();
  const [row] = await sql`
    SELECT COALESCE(SUM(COALESCE(file_size_bytes, original_size, 0)), 0)::bigint AS total
    FROM call_recordings
    WHERE org_id = ${orgId}::uuid AND deleted_at IS NULL
  `;
  const total = parseInt(row?.total || '0', 10);
  await sql`
    UPDATE organizations SET storage_used_bytes = ${total}, updated_at = NOW()
    WHERE id = ${orgId}::uuid
  `;
  return total;
}

/** Check whether org is within all quota limits. Returns violations. */
export async function checkOrgQuotas(
  orgId: string
): Promise<{ withinLimits: boolean; violations: string[] }> {
  const org = await getOrganizationById(orgId);
  if (!org) return { withinLimits: false, violations: ['Organization not found'] };
  if (org.isSuspended) return { withinLimits: false, violations: ['Account suspended: ' + (org.suspensionReason || 'contact support')] };

  const violations: string[] = [];

  if (org.maxCallsPerMonth > 0 && org.callsThisMonth >= org.maxCallsPerMonth) {
    violations.push(`Monthly call limit reached (${org.maxCallsPerMonth})`);
  }

  if (org.maxStorageBytes > 0 && org.storageUsedBytes >= org.maxStorageBytes) {
    const usedGB = (org.storageUsedBytes / 1e9).toFixed(1);
    const maxGB = (org.maxStorageBytes / 1e9).toFixed(0);
    violations.push(`Storage limit reached (${usedGB}GB / ${maxGB}GB)`);
  }

  return { withinLimits: violations.length === 0, violations };
}

// ============================================================================
// Slug generation
// ============================================================================

async function generateUniqueSlug(name: string): Promise<string> {
  const sql = db();
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  let slug = base;
  let attempts = 0;
  while (attempts < 20) {
    const existing = await sql`SELECT 1 FROM organizations WHERE slug = ${slug} LIMIT 1`;
    if (existing.length === 0) return slug;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    attempts++;
  }
  return `${base}-${Date.now()}`;
}

// ============================================================================
// Row mappers
// ============================================================================

function mapOrg(r: any): Organization {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    logoUrl: r.logo_url,
    website: r.website,
    plan: r.plan,
    planStartedAt: r.plan_started_at ? new Date(r.plan_started_at) : null,
    planExpiresAt: r.plan_expires_at ? new Date(r.plan_expires_at) : null,
    stripeCustomerId: r.stripe_customer_id,
    stripeSubscriptionId: r.stripe_subscription_id,
    maxUsers: r.max_users,
    maxStorageBytes: r.max_storage_bytes,
    maxCallsPerMonth: r.max_calls_per_month,
    callsThisMonth: r.calls_this_month,
    storageUsedBytes: r.storage_used_bytes,
    isActive: r.is_active,
    isSuspended: r.is_suspended,
    suspensionReason: r.suspension_reason,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

function mapMember(r: any): OrgMember {
  return {
    id: r.id,
    orgId: r.org_id,
    userId: r.user_id,
    role: r.role,
    joinedAt: new Date(r.joined_at),
    name: r.name,
    email: r.email,
    avatarUrl: r.avatar_url,
  };
}

function mapInvite(r: any): OrgInvite {
  return {
    id: r.id,
    orgId: r.org_id,
    invitedBy: r.invited_by,
    email: r.email,
    role: r.role,
    token: r.token,
    expiresAt: new Date(r.expires_at),
    acceptedAt: r.accepted_at ? new Date(r.accepted_at) : null,
    createdAt: new Date(r.created_at),
  };
}

function mapPlanLimits(r: any): PlanLimits {
  return {
    plan: r.plan,
    displayName: r.display_name,
    priceMonthly: r.price_monthly_cents / 100,
    maxUsers: r.max_users,
    maxStorageBytes: r.max_storage_bytes,
    maxCallsPerMonth: r.max_calls_per_month,
    features: typeof r.features === 'string' ? JSON.parse(r.features) : (r.features || []),
  };
}
