/**
 * POST /api/billing/portal
 * Phase 3: Create a Stripe Customer Portal session so customers can manage their subscription.
 *
 * Returns: { url: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { getOrganizationById } from '@/lib/database/organizations';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = user.orgId;
    if (!orgId) {
      return NextResponse.json({ error: 'User has no organization' }, { status: 400 });
    }

    const org = await getOrganizationById(orgId);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    if (!org.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No Stripe subscription found. Please upgrade to a paid plan first.' },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lifesync.app';

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${appUrl}/portal/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing/portal]', err);
    return NextResponse.json({ error: 'Failed to create billing portal session' }, { status: 500 });
  }
}
