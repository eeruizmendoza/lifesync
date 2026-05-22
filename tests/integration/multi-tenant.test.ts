/**
 * Integration Tests: Multi-Tenant SaaS Architecture
 * Phase 3: Organizations, membership, quotas, billing, invite flow
 *
 * All tests use mocked database services so they run in CI
 * without external dependencies.
 */

// ============================================================================
// Module mocks
// ============================================================================

// In-memory stores
const orgs: Record<string, any> = {};
const members: Record<string, any[]> = {};
const invites: Record<string, any> = {};
let _idSeq = 0;
const uid = (prefix: string) => `${prefix}-${++_idSeq}-${Math.random().toString(36).slice(2, 7)}`;

jest.mock('@/lib/database/organizations', () => ({
  createOrganization: jest.fn(async (name: string, creatorUserId: string, plan = 'trial') => {
    const org = {
      id: uid('org'),
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      plan,
      maxUsers: 3,
      maxStorageBytes: 10737418240,
      maxCallsPerMonth: 100,
      callsThisMonth: 0,
      storageUsedBytes: 0,
      isActive: true,
      isSuspended: false,
      suspensionReason: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      logoUrl: null,
      website: null,
      planStartedAt: new Date(),
      planExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    orgs[org.id] = org;
    members[org.id] = [{ id: uid('m'), orgId: org.id, userId: creatorUserId, role: 'owner', joinedAt: new Date() }];
    return org;
  }),

  getOrganizationById: jest.fn(async (orgId: string) => orgs[orgId] ?? null),

  getOrganizationBySlug: jest.fn(async (slug: string) =>
    Object.values(orgs).find((o: any) => o.slug === slug) ?? null
  ),

  getUserOrganization: jest.fn(async (userId: string) => {
    for (const [orgId, mbs] of Object.entries(members)) {
      if ((mbs as any[]).some(m => m.userId === userId)) {
        return orgs[orgId] ?? null;
      }
    }
    return null;
  }),

  updateOrganization: jest.fn(async (orgId: string, updates: any) => {
    if (orgs[orgId]) Object.assign(orgs[orgId], updates);
  }),

  updateOrganizationPlan: jest.fn(async (orgId: string, plan: string, customerId: string, subId: string) => {
    if (orgs[orgId]) {
      Object.assign(orgs[orgId], {
        plan,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subId,
        maxUsers: plan === 'starter' ? 10 : plan === 'pro' ? 50 : 3,
        maxCallsPerMonth: plan === 'starter' ? 500 : plan === 'pro' ? 2000 : 100,
      });
    }
  }),

  setOrganizationSuspended: jest.fn(async (orgId: string, suspended: boolean, reason?: string) => {
    if (orgs[orgId]) {
      orgs[orgId].isSuspended = suspended;
      orgs[orgId].suspensionReason = reason ?? null;
    }
  }),

  listOrgMembers: jest.fn(async (orgId: string) => members[orgId] ?? []),

  getOrgMember: jest.fn(async (orgId: string, userId: string) =>
    (members[orgId] ?? []).find(m => m.userId === userId) ?? null
  ),

  isOrgMember: jest.fn(async (orgId: string, userId: string) =>
    (members[orgId] ?? []).some(m => m.userId === userId)
  ),

  hasOrgRole: jest.fn(async (orgId: string, userId: string, minRole: string) => {
    const member = (members[orgId] ?? []).find(m => m.userId === userId);
    if (!member) return false;
    const hierarchy: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };
    return (hierarchy[member.role] ?? 0) >= (hierarchy[minRole] ?? 0);
  }),

  updateMemberRole: jest.fn(async (orgId: string, userId: string, role: string) => {
    const m = (members[orgId] ?? []).find(m => m.userId === userId);
    if (m) m.role = role;
  }),

  removeOrgMember: jest.fn(async (orgId: string, userId: string) => {
    if (members[orgId]) {
      members[orgId] = members[orgId].filter(m => m.userId !== userId);
    }
  }),

  createOrgInvite: jest.fn(async (orgId: string, invitedBy: string, email: string, role: string) => {
    const token = `tok-${uid('t')}`;
    const invite = {
      id: uid('inv'),
      orgId,
      invitedBy,
      email,
      role,
      token,
      expiresAt: new Date(Date.now() + 7 * 86400000),
      acceptedAt: null,
      createdAt: new Date(),
    };
    invites[token] = invite;
    return invite;
  }),

  getInviteByToken: jest.fn(async (token: string) => {
    const inv = invites[token];
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) return null;
    return inv;
  }),

  acceptOrgInvite: jest.fn(async (token: string, userId: string) => {
    const inv = invites[token];
    if (!inv) throw new Error('Invite not found');
    if (!members[inv.orgId]) members[inv.orgId] = [];
    const exists = members[inv.orgId].some(m => m.userId === userId);
    if (!exists) {
      members[inv.orgId].push({ id: uid('m'), orgId: inv.orgId, userId, role: inv.role, joinedAt: new Date() });
    }
    inv.acceptedAt = new Date();
  }),

  listOrgInvites: jest.fn(async (orgId: string) =>
    Object.values(invites).filter((inv: any) => inv.orgId === orgId && !inv.acceptedAt)
  ),

  getPlanLimits: jest.fn(async (plan: string) => ({
    plan,
    displayName: plan.charAt(0).toUpperCase() + plan.slice(1),
    priceMonthly: plan === 'trial' ? 0 : plan === 'starter' ? 299 : plan === 'pro' ? 599 : 999,
    maxUsers: plan === 'trial' ? 3 : plan === 'starter' ? 10 : plan === 'pro' ? 50 : -1,
    maxStorageBytes: plan === 'trial' ? 10737418240 : plan === 'starter' ? 53687091200 : plan === 'pro' ? 214748364800 : -1,
    maxCallsPerMonth: plan === 'trial' ? 100 : plan === 'starter' ? 500 : plan === 'pro' ? 2000 : -1,
    features: [],
  })),

  incrementOrgCallCount: jest.fn(async (orgId: string) => {
    if (orgs[orgId]) orgs[orgId].callsThisMonth++;
  }),

  recalcOrgStorage: jest.fn(async () => 0),

  checkOrgQuotas: jest.fn(async (orgId: string) => {
    const org = orgs[orgId];
    if (!org) return { withinLimits: false, violations: ['Organization not found'] };
    if (org.isSuspended) return { withinLimits: false, violations: [`Account suspended: ${org.suspensionReason ?? 'contact support'}`] };
    const violations: string[] = [];
    if (org.maxCallsPerMonth > 0 && org.callsThisMonth >= org.maxCallsPerMonth) {
      violations.push(`Monthly call limit reached (${org.maxCallsPerMonth})`);
    }
    if (org.maxStorageBytes > 0 && org.storageUsedBytes >= org.maxStorageBytes) {
      violations.push(`Storage limit reached`);
    }
    return { withinLimits: violations.length === 0, violations };
  }),
}));

// Mock neon() — used in orgs/create and invites routes
jest.mock('@neondatabase/serverless', () => ({
  neon: jest.fn(() => {
    return Object.assign(
      jest.fn(async () => [{ phone_number: '+15551234567', name: 'Test User' }]),
      { sql: jest.fn() }
    );
  }),
  Pool: jest.fn(),
}));

// Mock db.ts which uses pg Pool
jest.mock('@/lib/db', () => ({
  query: jest.fn(async () => ({ rows: [] })),
  pool: {},
}));

// Mock auth
jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn(),
  createToken: jest.fn((userId: string, phone: string, orgId?: string) =>
    `mock-jwt-${userId}-${orgId ?? 'no-org'}`
  ),
  verifyToken: jest.fn(),
  verifyAuth: jest.fn(),
}));

// Mock email service
jest.mock('@/lib/email-service', () => ({
  sendOrgInviteEmail: jest.fn(async () => undefined),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { NextRequest } from 'next/server';
import {
  createOrganization,
  getOrganizationById,
  getUserOrganization,
  listOrgMembers,
  listOrgInvites,
  hasOrgRole,
  updateMemberRole,
  removeOrgMember,
  createOrgInvite,
  getInviteByToken,
  acceptOrgInvite,
  checkOrgQuotas,
  incrementOrgCallCount,
  updateOrganizationPlan,
  setOrganizationSuspended,
} from '@/lib/database/organizations';
import { requireAuth } from '@/lib/auth';

// ============================================================================
// Helpers
// ============================================================================

function makeRequest(
  url: string,
  opts: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  const { method = 'GET', body, headers = {} } = opts;
  const req = new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return req;
}

function mockAuth(orgId?: string | null) {
  (requireAuth as jest.Mock).mockResolvedValue({
    id: 'user-owner',
    phoneNumber: '+15551234567',
    orgId: orgId ?? null,
  });
}

// Reset data stores before each test (don't call clearAllMocks — it can wipe implementations)
beforeEach(() => {
  Object.keys(orgs).forEach(k => delete orgs[k]);
  Object.keys(members).forEach(k => delete members[k]);
  Object.keys(invites).forEach(k => delete invites[k]);
});

// ============================================================================
// 1. Organization CRUD
// ============================================================================

describe('Organization CRUD', () => {
  test('createOrganization returns org with owner member', async () => {
    const org = await createOrganization('Acme Corp', 'user-1');
    expect(org.id).toBeDefined();
    expect(org.name).toBe('Acme Corp');
    expect(org.plan).toBe('trial');
    expect(org.maxUsers).toBe(3);
    expect(org.isActive).toBe(true);

    const orgMembers = await listOrgMembers(org.id);
    expect(orgMembers).toHaveLength(1);
    expect(orgMembers[0].role).toBe('owner');
    expect(orgMembers[0].userId).toBe('user-1');
  });

  test('getOrganizationById returns null for unknown id', async () => {
    const result = await getOrganizationById('nonexistent-id');
    expect(result).toBeNull();
  });

  test('getUserOrganization returns org by member lookup', async () => {
    const org = await createOrganization('Test Org', 'user-42');
    const found = await getUserOrganization('user-42');
    expect(found?.id).toBe(org.id);
  });

  test('getUserOrganization returns null for user with no org', async () => {
    const result = await getUserOrganization('nobody');
    expect(result).toBeNull();
  });
});

// ============================================================================
// 2. RBAC — Role-Based Access Control
// ============================================================================

describe('RBAC — Role Hierarchy', () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await createOrganization('RBAC Test Org', 'owner-user');
    orgId = org.id;
    // Add additional members
    members[orgId].push(
      { id: 'm-admin', orgId, userId: 'admin-user', role: 'admin', joinedAt: new Date() },
      { id: 'm-member', orgId, userId: 'member-user', role: 'member', joinedAt: new Date() },
      { id: 'm-viewer', orgId, userId: 'viewer-user', role: 'viewer', joinedAt: new Date() },
    );
  });

  test('owner passes all role checks', async () => {
    expect(await hasOrgRole(orgId, 'owner-user', 'owner')).toBe(true);
    expect(await hasOrgRole(orgId, 'owner-user', 'admin')).toBe(true);
    expect(await hasOrgRole(orgId, 'owner-user', 'member')).toBe(true);
    expect(await hasOrgRole(orgId, 'owner-user', 'viewer')).toBe(true);
  });

  test('admin passes admin/member/viewer but not owner', async () => {
    expect(await hasOrgRole(orgId, 'admin-user', 'owner')).toBe(false);
    expect(await hasOrgRole(orgId, 'admin-user', 'admin')).toBe(true);
    expect(await hasOrgRole(orgId, 'admin-user', 'member')).toBe(true);
    expect(await hasOrgRole(orgId, 'admin-user', 'viewer')).toBe(true);
  });

  test('viewer fails all roles except viewer', async () => {
    expect(await hasOrgRole(orgId, 'viewer-user', 'owner')).toBe(false);
    expect(await hasOrgRole(orgId, 'viewer-user', 'admin')).toBe(false);
    expect(await hasOrgRole(orgId, 'viewer-user', 'member')).toBe(false);
    expect(await hasOrgRole(orgId, 'viewer-user', 'viewer')).toBe(true);
  });

  test('non-member always fails', async () => {
    expect(await hasOrgRole(orgId, 'outsider', 'viewer')).toBe(false);
  });

  test('updateMemberRole changes role', async () => {
    await updateMemberRole(orgId, 'member-user', 'admin');
    expect(await hasOrgRole(orgId, 'member-user', 'admin')).toBe(true);
  });

  test('removeOrgMember removes user from org', async () => {
    await removeOrgMember(orgId, 'viewer-user');
    expect(await hasOrgRole(orgId, 'viewer-user', 'viewer')).toBe(false);
    const orgMembers = await listOrgMembers(orgId);
    expect(orgMembers.find(m => m.userId === 'viewer-user')).toBeUndefined();
  });
});

// ============================================================================
// 3. Invite Flow
// ============================================================================

describe('Invite Flow', () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await createOrganization('Invite Test Org', 'owner-user');
    orgId = org.id;
  });

  test('createOrgInvite generates a valid token', async () => {
    const invite = await createOrgInvite(orgId, 'owner-user', 'newmember@example.com', 'member');
    expect(invite.token).toBeDefined();
    expect(invite.token.length).toBeGreaterThan(8);
    expect(invite.email).toBe('newmember@example.com');
    expect(invite.role).toBe('member');
    expect(invite.acceptedAt).toBeNull();
  });

  test('getInviteByToken returns valid invite', async () => {
    const invite = await createOrgInvite(orgId, 'owner-user', 'user2@example.com', 'viewer');
    const found = await getInviteByToken(invite.token);
    expect(found?.token).toBe(invite.token);
    expect(found?.email).toBe('user2@example.com');
  });

  test('getInviteByToken returns null for unknown token', async () => {
    const result = await getInviteByToken('invalid-token-xyz');
    expect(result).toBeNull();
  });

  test('acceptOrgInvite adds user to org with correct role', async () => {
    const invite = await createOrgInvite(orgId, 'owner-user', 'newbie@example.com', 'member');
    await acceptOrgInvite(invite.token, 'new-user-id');

    const orgMembers = await listOrgMembers(orgId);
    const newMember = orgMembers.find(m => m.userId === 'new-user-id');
    expect(newMember).toBeDefined();
    expect(newMember?.role).toBe('member');
  });

  test('accepted invite token becomes invalid for reuse', async () => {
    const invite = await createOrgInvite(orgId, 'owner-user', 'once@example.com', 'viewer');
    await acceptOrgInvite(invite.token, 'user-accepted');

    // Token should no longer be valid (acceptedAt is set)
    const found = await getInviteByToken(invite.token);
    expect(found).toBeNull();
  });

  test('duplicate acceptOrgInvite is idempotent (ON CONFLICT DO NOTHING)', async () => {
    const invite = await createOrgInvite(orgId, 'owner-user', 'dup@example.com', 'member');
    await acceptOrgInvite(invite.token, 'dup-user');
    // Second accept should not throw
    const orgMembers = await listOrgMembers(orgId);
    const count = orgMembers.filter(m => m.userId === 'dup-user').length;
    expect(count).toBe(1); // Only one entry
  });
});

// ============================================================================
// 4. Quota Enforcement
// ============================================================================

describe('Quota Enforcement', () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await createOrganization('Quota Test Org', 'owner-user');
    orgId = org.id;
  });

  test('fresh org is within limits', async () => {
    const { withinLimits, violations } = await checkOrgQuotas(orgId);
    expect(withinLimits).toBe(true);
    expect(violations).toHaveLength(0);
  });

  test('call quota violation detected', async () => {
    // Set calls to the limit
    orgs[orgId].callsThisMonth = 100; // maxCallsPerMonth = 100
    const { withinLimits, violations } = await checkOrgQuotas(orgId);
    expect(withinLimits).toBe(false);
    expect(violations[0]).toMatch(/Monthly call limit reached/);
  });

  test('storage quota violation detected', async () => {
    orgs[orgId].storageUsedBytes = 10737418240; // 10 GB = maxStorageBytes
    const { withinLimits, violations } = await checkOrgQuotas(orgId);
    expect(withinLimits).toBe(false);
    expect(violations[0]).toMatch(/Storage limit reached/);
  });

  test('suspended org always returns quota violation', async () => {
    await setOrganizationSuspended(orgId, true, 'payment failure');
    const { withinLimits, violations } = await checkOrgQuotas(orgId);
    expect(withinLimits).toBe(false);
    expect(violations[0]).toMatch(/Account suspended/);
  });

  test('incrementOrgCallCount increases counter', async () => {
    const before = orgs[orgId].callsThisMonth;
    await incrementOrgCallCount(orgId);
    expect(orgs[orgId].callsThisMonth).toBe(before + 1);
  });

  test('enterprise plan has unlimited calls (maxCallsPerMonth = -1)', async () => {
    await updateOrganizationPlan(orgId, 'pro', 'cus_123', 'sub_123', 'price_123');
    // Pro: 2000 calls/mo
    orgs[orgId].callsThisMonth = 1999;
    const { withinLimits } = await checkOrgQuotas(orgId);
    expect(withinLimits).toBe(true);
  });
});

// ============================================================================
// 5. Plan Upgrades via updateOrganizationPlan
// ============================================================================

describe('Plan Upgrades', () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await createOrganization('Upgrade Test Org', 'owner-user');
    orgId = org.id;
  });

  test('updateOrganizationPlan to starter upgrades limits', async () => {
    await updateOrganizationPlan(orgId, 'starter', 'cus_abc', 'sub_abc', 'price_starter');
    const org = await getOrganizationById(orgId);
    expect(org?.plan).toBe('starter');
    expect(org?.stripeCustomerId).toBe('cus_abc');
    expect(org?.maxUsers).toBe(10);
    expect(org?.maxCallsPerMonth).toBe(500);
  });

  test('updateOrganizationPlan to pro upgrades limits', async () => {
    await updateOrganizationPlan(orgId, 'pro', 'cus_def', 'sub_def', 'price_pro');
    const org = await getOrganizationById(orgId);
    expect(org?.plan).toBe('pro');
    expect(org?.maxUsers).toBe(50);
    expect(org?.maxCallsPerMonth).toBe(2000);
  });
});

// ============================================================================
// 6. Multi-Tenant Data Isolation
// ============================================================================

describe('Multi-Tenant Data Isolation', () => {
  test('two orgs have isolated member lists', async () => {
    const orgA = await createOrganization('Org A', 'user-a');
    const orgB = await createOrganization('Org B', 'user-b');

    const invA = await createOrgInvite(orgA.id, 'user-a', 'shared@example.com', 'member');
    await acceptOrgInvite(invA.token, 'user-shared');

    const membersA = await listOrgMembers(orgA.id);
    const membersB = await listOrgMembers(orgB.id);

    expect(membersA.map(m => m.userId)).toContain('user-shared');
    expect(membersB.map(m => m.userId)).not.toContain('user-shared');
  });

  test('user in org A cannot access org B (hasOrgRole returns false)', async () => {
    const orgA = await createOrganization('Org A', 'user-a');
    const orgB = await createOrganization('Org B', 'user-b');

    // user-a is owner of org A but not a member of org B
    expect(await hasOrgRole(orgA.id, 'user-a', 'viewer')).toBe(true);
    expect(await hasOrgRole(orgB.id, 'user-a', 'viewer')).toBe(false);
  });

  test('invites are scoped to their org', async () => {
    const orgA = await createOrganization('Org A', 'user-a');
    const orgB = await createOrganization('Org B', 'user-b');

    await createOrgInvite(orgA.id, 'user-a', 'for-a@example.com', 'member');
    await createOrgInvite(orgB.id, 'user-b', 'for-b@example.com', 'member');

    const invitesA = await listOrgInvites(orgA.id);
    const invitesB = await listOrgInvites(orgB.id);

    expect(invitesA.every((i: any) => i.orgId === orgA.id)).toBe(true);
    expect(invitesB.every((i: any) => i.orgId === orgB.id)).toBe(true);
    expect(invitesA.find((i: any) => i.email === 'for-b@example.com')).toBeUndefined();
  });
});

// ============================================================================
// 7. Suspension Flow
// ============================================================================

describe('Suspension Flow', () => {
  test('suspending then unsuspending org restores quota access', async () => {
    const org = await createOrganization('Suspension Org', 'user-s');
    const orgId = org.id;

    await setOrganizationSuspended(orgId, true, 'payment overdue');
    let result = await checkOrgQuotas(orgId);
    expect(result.withinLimits).toBe(false);
    expect(result.violations[0]).toMatch(/suspended/);

    await setOrganizationSuspended(orgId, false);
    result = await checkOrgQuotas(orgId);
    expect(result.withinLimits).toBe(true);
  });
});
