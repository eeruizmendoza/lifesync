/**
 * Tenant Middleware — Phase 3 Multi-Tenant SaaS
 *
 * Provides reusable helpers that API route handlers call to:
 *  1. Resolve the org from the authenticated user's JWT
 *  2. Enforce quota limits before processing the request
 *  3. Build org-scoped Neon query helpers
 *
 * Usage in any API route:
 *
 *   const { org, quotaError } = await requireOrgContext(user);
 *   if (quotaError) return quotaError;
 *   // org.id is now available for all DB queries
 */

import { NextResponse } from 'next/server';
import {
  getOrganizationById,
  checkOrgQuotas,
  incrementOrgCallCount,
  hasOrgRole,
} from './database/organizations';
import type { Organization } from './database/organizations';

export interface OrgContext {
  org: Organization;
}

/**
 * Resolve org from user.orgId and enforce quotas.
 * Returns `{ org }` on success or `{ quotaError: NextResponse }` on failure.
 */
export async function requireOrgContext(
  user: { id: string; orgId?: string | null },
  options: { checkQuotas?: boolean; resource?: 'calls' | 'storage' } = {}
): Promise<{ org: Organization; quotaError?: never } | { org?: never; quotaError: NextResponse }> {
  if (!user.orgId) {
    return {
      quotaError: NextResponse.json(
        { error: 'User has no organization. Create one at /portal/onboarding.' },
        { status: 402 }
      ),
    };
  }

  const org = await getOrganizationById(user.orgId);
  if (!org) {
    return {
      quotaError: NextResponse.json({ error: 'Organization not found' }, { status: 404 }),
    };
  }

  if (org.isSuspended) {
    return {
      quotaError: NextResponse.json(
        { error: `Account suspended: ${org.suspensionReason ?? 'contact support'}` },
        { status: 403 }
      ),
    };
  }

  if (options.checkQuotas !== false) {
    const { withinLimits, violations } = await checkOrgQuotas(user.orgId);
    if (!withinLimits) {
      return {
        quotaError: NextResponse.json(
          {
            error: 'Quota exceeded. Upgrade your plan to continue.',
            violations,
            upgradeUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/portal/billing`,
          },
          { status: 402 }
        ),
      };
    }
  }

  return { org };
}

/**
 * Increment the org's monthly call counter.
 * Call this AFTER a call or transcription request succeeds.
 */
export async function recordCallUsage(orgId: string): Promise<void> {
  try {
    await incrementOrgCallCount(orgId);
  } catch (err) {
    // Non-fatal — log but don't fail the request
    console.error('[tenant] Failed to increment call count for org', orgId, err);
  }
}

/**
 * Require that the user has at least 'admin' role in their org.
 * Returns null on success or a 403 NextResponse on failure.
 *
 * Usage:
 *   const roleError = await requireAdminRole(user);
 *   if (roleError) return roleError;
 */
export async function requireAdminRole(
  user: { id: string; orgId?: string | null },
  minRole: 'owner' | 'admin' | 'member' | 'viewer' = 'admin'
): Promise<NextResponse | null> {
  if (!user.orgId) {
    return NextResponse.json({ error: 'No organization' }, { status: 400 });
  }
  const ok = await hasOrgRole(user.orgId, user.id, minRole);
  if (!ok) {
    return NextResponse.json(
      { error: `This action requires ${minRole} role or higher` },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Build a WHERE clause fragment for filtering by org.
 * Use with parameterized queries only — never string-interpolate untrusted input.
 *
 * Example:
 *   const rows = await sql`
 *     SELECT * FROM calls
 *     WHERE org_id = ${orgId}::uuid
 *     AND caller_id = ${userId}::uuid
 *   `;
 */
export function orgFilter(orgId: string): string {
  // Returns the raw orgId for use in template literal SQL
  // The actual escaping is handled by @neondatabase/serverless's tagged template
  return orgId;
}
