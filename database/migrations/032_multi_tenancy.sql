/**
 * Migration 032: Multi-Tenant SaaS Architecture
 * Phase 3 — Organizations, membership, plan enforcement
 *
 * Adds:
 *   organizations          — one row per paying tenant
 *   organization_members   — maps users to orgs with roles
 *   organization_invites   — pending email invitations
 *
 * Extends existing tables with org_id for tenant isolation:
 *   users, calls, call_recordings, conversations, messages,
 *   contacts, files, conversation_recordings, posts
 */

-- ============================================================================
-- 1. organizations
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,   -- URL-safe name, e.g. "acme-corp"
  logo_url TEXT,
  website VARCHAR(255),

  -- Subscription / billing
  plan VARCHAR(20) NOT NULL DEFAULT 'trial',
  -- plans: trial | starter | pro | enterprise
  plan_started_at TIMESTAMP,
  plan_expires_at TIMESTAMP,           -- NULL = active subscription (Stripe manages)
  stripe_customer_id VARCHAR(100) UNIQUE,
  stripe_subscription_id VARCHAR(100) UNIQUE,
  stripe_price_id VARCHAR(100),

  -- Usage limits (enforced by middleware)
  max_users INTEGER NOT NULL DEFAULT 3,
  max_storage_bytes BIGINT NOT NULL DEFAULT 10737418240,  -- 10 GB default
  max_calls_per_month INTEGER NOT NULL DEFAULT 100,

  -- Usage counters (reset monthly by cron)
  calls_this_month INTEGER NOT NULL DEFAULT 0,
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  suspension_reason TEXT,

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_stripe_customer ON organizations(stripe_customer_id);
CREATE INDEX idx_organizations_plan ON organizations(plan) WHERE is_active = true;

-- ============================================================================
-- 2. organization_members
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  role VARCHAR(20) NOT NULL DEFAULT 'member',
  -- roles: owner | admin | member | viewer

  -- When owner transfers org or admin demotes a member
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_members_org_id ON organization_members(org_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);

-- ============================================================================
-- 3. organization_invites
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member',

  -- Secure token sent in the invite email
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, email)
);

CREATE INDEX idx_org_invites_token ON organization_invites(token);
CREATE INDEX idx_org_invites_email ON organization_invites(email);
CREATE INDEX idx_org_invites_org_id ON organization_invites(org_id);

-- ============================================================================
-- 4. Add org_id to users (which org they primarily belong to)
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);

-- ============================================================================
-- 5. Add org_id to calls
-- ============================================================================

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calls_org_id ON calls(org_id);

-- ============================================================================
-- 6. Add org_id to call_recordings
-- ============================================================================

ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_recordings_org_id ON call_recordings(org_id);

-- ============================================================================
-- 7. Add org_id to conversations
-- ============================================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON conversations(org_id);

-- ============================================================================
-- 8. Add org_id to messages
-- ============================================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_org_id ON messages(org_id);

-- ============================================================================
-- 9. Add org_id to contacts
-- ============================================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON contacts(org_id);

-- ============================================================================
-- 10. Add org_id to files
-- ============================================================================

ALTER TABLE files
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_org_id ON files(org_id);

-- ============================================================================
-- 11. Add org_id to posts (social feed is per-org)
-- ============================================================================

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_org_id ON posts(org_id);

-- ============================================================================
-- 12. Plan limits reference table (for UI display)
-- ============================================================================

CREATE TABLE IF NOT EXISTS plan_limits (
  plan VARCHAR(20) PRIMARY KEY,
  display_name VARCHAR(50) NOT NULL,
  price_monthly_cents INTEGER NOT NULL,  -- 0 = free/trial
  max_users INTEGER NOT NULL,
  max_storage_bytes BIGINT NOT NULL,
  max_calls_per_month INTEGER NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'
);

INSERT INTO plan_limits (plan, display_name, price_monthly_cents, max_users, max_storage_bytes, max_calls_per_month, features)
VALUES
  ('trial',      'Free Trial',  0,       3,   10737418240,   100,  '["calls","recordings","transcription"]'),
  ('starter',    'Starter',     29900,   10,  53687091200,   500,  '["calls","recordings","transcription","analytics"]'),
  ('pro',        'Pro',         59900,   50,  214748364800,  2000, '["calls","recordings","transcription","analytics","api_access","priority_support"]'),
  ('enterprise', 'Enterprise',  99900,   -1,  -1,            -1,   '["calls","recordings","transcription","analytics","api_access","priority_support","sso","custom_domain","sla"]')
ON CONFLICT (plan) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  max_users = EXCLUDED.max_users,
  max_storage_bytes = EXCLUDED.max_storage_bytes,
  max_calls_per_month = EXCLUDED.max_calls_per_month,
  features = EXCLUDED.features;
