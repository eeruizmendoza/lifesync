/**
 * Stripe Client — Phase 3 Multi-Tenant SaaS
 * Lazy singleton — only instantiated when first called, not at build time.
 * This prevents the build from failing when STRIPE_SECRET_KEY is not set locally.
 */

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/**
 * Get the Stripe client (lazy singleton).
 * Throws at RUNTIME if STRIPE_SECRET_KEY is missing, not at build time.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        'STRIPE_SECRET_KEY is not configured. ' +
        'Add it to your Vercel environment variables and redeploy.'
      );
    }
    _stripe = new Stripe(key, {
      apiVersion: '2025-05-28.basil',
      typescript: true,
    });
  }
  return _stripe;
}

// Convenience alias — the same object, lazily created
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as any)[prop];
  },
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
