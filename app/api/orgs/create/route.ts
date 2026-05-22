/**
 * POST /api/orgs/create
 * Phase 3: Create a new organization and make the caller the owner.
 *
 * Body: { name: string }
 * Returns: { org, token }  — new JWT with orgId embedded
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createToken } from '@/lib/auth';
import { createOrganization } from '@/lib/database/organizations';
import { neon } from '@neondatabase/serverless';
import { sendWelcomeEmail } from '@/lib/email-service';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { name } = body as { name?: string };

    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: 'Organization name must be at least 2 characters' }, { status: 400 });
    }
    if (name.trim().length > 100) {
      return NextResponse.json({ error: 'Organization name must be 100 characters or fewer' }, { status: 400 });
    }

    // Users can only belong to one org (for now)
    if (user.orgId) {
      return NextResponse.json({ error: 'You already belong to an organization' }, { status: 409 });
    }

    const org = await createOrganization(name.trim(), user.id, 'trial');

    // Issue a new token with orgId embedded so the frontend has it immediately
    const sql = neon(process.env.DATABASE_URL!);
    const [row] = await sql`SELECT phone_number, name, email FROM users WHERE id = ${user.id}::uuid`;
    const phoneNumber = row?.phone_number ?? user.phoneNumber ?? '';
    const newToken = createToken(user.id, phoneNumber, org.id);

    // Send welcome email — non-blocking
    if (row?.email) {
      sendWelcomeEmail({
        toEmail: String(row.email),
        userName: row.name ? String(row.name) : null,
        orgName: org.name,
      }).catch(() => {});
    }

    return NextResponse.json({ org, token: newToken }, { status: 201 });
  } catch (err) {
    console.error('[orgs/create]', err);
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }
}
