/**
 * POST /api/billing/webhook
 * Phase 3: Stripe webhook handler — updates plan in DB on subscription events.
 *
 * Events handled:
 *   checkout.session.completed      → new subscription created
 *   customer.subscription.updated   → plan changed or renewed
 *   customer.subscription.deleted   → subscription cancelled → downgrade to trial
 *   invoice.payment_failed          → optionally suspend org
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe, planFromPriceId } from '@/lib/stripe';
import { updateOrganizationPlan, setOrganizationSuspended } from '@/lib/database/organizations';
import type Stripe from 'stripe';

// Webhook secret from Stripe dashboard → Webhooks → your endpoint
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature') ?? '';

  // Verify the payload came from Stripe
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[billing/webhook] Invalid signature:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(sub);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
      default:
        // Ignore other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[billing/webhook] Handler error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

// ============================================================================
// Handlers
// ============================================================================

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.orgId;
  if (!orgId) { console.warn('[webhook] No orgId in checkout metadata'); return; }

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id ?? '';
  const plan = planFromPriceId(priceId);
  if (!plan) { console.warn('[webhook] Unknown price ID:', priceId); return; }

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? '';

  await updateOrganizationPlan(orgId, plan, customerId, subscriptionId, priceId);
  console.info(`[webhook] Org ${orgId} upgraded to ${plan}`);
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const orgId = sub.metadata?.orgId;
  if (!orgId) return;

  const priceId = sub.items.data[0]?.price.id ?? '';
  const plan = planFromPriceId(priceId);
  if (!plan) return;

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  await updateOrganizationPlan(orgId, plan, customerId, sub.id, priceId);
  console.info(`[webhook] Org ${orgId} subscription updated to ${plan}`);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const orgId = sub.metadata?.orgId;
  if (!orgId) return;

  // Downgrade to trial plan — use a placeholder stripe IDs so we don't lose the customer link
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  await updateOrganizationPlan(orgId, 'trial', customerId, '', '');
  console.info(`[webhook] Org ${orgId} subscription cancelled — downgraded to trial`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // After multiple failures Stripe cancels the subscription automatically.
  // We log but don't suspend immediately — give Stripe's dunning time to retry.
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  console.warn(`[webhook] Payment failed for customer ${customerId}. Invoice: ${invoice.id}`);
}
