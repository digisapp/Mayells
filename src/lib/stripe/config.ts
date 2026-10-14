import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

/**
 * Whether a Stripe secret key is set. Routes that start a Stripe flow check
 * this first so a missing key answers "card payment isn't available" instead
 * of a generic 500 from deep inside the SDK.
 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  if (!stripeClient) {
    if (!isStripeConfigured()) throw new Error('STRIPE_SECRET_KEY is not configured');
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover' as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return stripeClient;
}

// Re-export as `stripe` for convenience — lazy getter
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
