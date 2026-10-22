/**
 * Whether Buy Now can actually take a payment, for the admin lot page: a
 * piece can be switched on for online checkout long before the Stripe
 * account is ready, and staff should see why its Buy Now button isn't live.
 */

import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { isGallerySalesTaxEnabled } from './config';
import { logger } from '@/lib/logger';

export interface CheckoutReadiness {
  /** STRIPE_SECRET_KEY is set: without it the public page offers an inquiry instead. */
  stripe: boolean;
  /** STRIPE_WEBHOOK_SECRET is set: without it payments are taken but never recorded. */
  webhook: boolean;
  /** Stripe Tax state: 'active', 'pending' (set up unfinished), 'off' (STRIPE_TAX=off) or 'unknown'. */
  tax: 'active' | 'pending' | 'off' | 'unknown';
}

let cached: { at: number; value: CheckoutReadiness } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function getCheckoutReadiness(): Promise<CheckoutReadiness> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const value: CheckoutReadiness = {
    stripe: isStripeConfigured(),
    webhook: !!process.env.STRIPE_WEBHOOK_SECRET,
    tax: isGallerySalesTaxEnabled() ? 'unknown' : 'off',
  };
  if (value.stripe && value.tax === 'unknown') {
    try {
      const settings = await stripe.tax.settings.retrieve();
      value.tax = settings.status === 'active' ? 'active' : 'pending';
    } catch (err) {
      logger.warn('Could not read Stripe Tax settings', { err: String(err) });
    }
  }
  cached = { at: Date.now(), value };
  return value;
}
