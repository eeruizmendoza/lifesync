/**
 * POST /api/billing/checkout
 * Phase 3: Create a Stripe Checkout session to upgrade org plan.
 *
 * Body: { plan: 'starter' | 'pro' | 'enterprise' }
 * Returns: { url: string }  — redirect the browser here
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { stripe, STRIPE_PRICE_IDS } from '@/lib/stripe';
import { getUserOrganization, getOrganizationById } from '@/lib/database/organizations';
import { requireAdminRole } from '@/lib/tenant-middleware';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Billing changes require owner or admin role
    const roleErr = await requireAdminRole(user);
    if (roleErr) return roleErr;

    const body = await req.json().catch(() => ({}));
    const { plan } = body as { plan?: string };

    if (!plan || !['starter', 'pro', 'enterprise'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan. Must be: starter, pro, enterprise' }, { status: 400 });
    }

    const priceId = STRIPE_PRICE_IDS[plan];
    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price ID not configured for plan "${plan}". Set STRIPE_PRICE_${plan.toUpperCase()} env var.` },
        { status: 503 }
      );
    }

    // Resolve org
    const orgId = user.orgId;
    if (!orgId) {
      return NextResponse.json({ error: 'User has no organization. Create one first.' }, { status: 400 });
    }
    const org = await getOrganizationById(orgId);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lifesync.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      // Prefill email if we have it
      customer_email: undefined, // TODO: pull from users table when email is stored
      // Pass existing customer if org already has one
      ...(org.stripeCustomerId ? { customer: org.stripeCustomerId } : {}),
      metadata: {
        orgId,
        userId: user.id,
        plan,
      },
      subscription_data: {
        metadata: { orgId, userId: user.id, plan },
      },
      success_url: `${appUrl}/portal/billing?success=1&plan=${plan}`,
      cancel_url:  `${appUrl}/portal/billing?canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing/checkout]', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
