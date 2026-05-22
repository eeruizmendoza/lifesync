/**
 * Stripe Client — Phase 3 Multi-Tenant SaaS
 * Singleton so we reuse across serverless invocations.
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  // Fail hard in production; allow undefined in test environments
  if (process.env.NODE_ENV === 'production') {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: '2025-05-28.basil',
  typescript: true,
});

/**
 * Stripe Price IDs per plan.
 * Set these in Vercel env vars after creating products in the Stripe dashboard.
 */
export const STRIPE_PRICE_IDS: Record<string, string> = {
  starter:    process.env.STRIPE_PRICE_STARTER    ?? '',
  pro:        process.env.STRIPE_PRICE_PRO        ?? '',
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? '',
};

/**
 * Map a Stripe Price ID back to a plan name.
 * Used in webhook handler to know which plan was activated.
 */
export function planFromPriceId(priceId: string): 'starter' | 'pro' | 'enterprise' | null {
  for (const [plan, id] of Object.entries(STRIPE_PRICE_IDS)) {
    if (id && id === priceId) return plan as 'starter' | 'pro' | 'enterprise';
  }
  return null;
}
