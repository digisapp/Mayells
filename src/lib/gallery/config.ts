import type Stripe from 'stripe';

/**
 * Gallery (fixed-price) online checkout settings. The policy numbers here
 * are quoted to buyers on the lot page, in the order email and in the
 * Conditions of Sale (/terms 2.15–2.16): change them together.
 */
export const GALLERY_CHECKOUT = {
  /**
   * How long starting checkout reserves a piece. Stripe will not create a
   * Checkout session that lives less than 30 minutes; the extra two cover
   * the clock gap between our server and Stripe's.
   */
  holdMinutes: 32,
  /**
   * Abuse limits: a buyer can hold at most this many pieces at once, and
   * start checkout on one piece at most this many times a day, so nobody can
   * keep a piece "on hold" indefinitely by restarting checkout.
   */
  maxLiveHoldsPerBuyer: 3,
  maxHoldsPerPiecePerDay: 3,
  /**
   * The as-described guarantee: a buyer whose piece arrives damaged, or
   * materially different from its catalogue description, may report it
   * within this many days of delivery for a full refund on its return.
   * Otherwise gallery sales are final.
   */
  guaranteeDays: 7,
  /** Online checkout ships to US addresses only; anywhere else goes through a specialist. */
  shippingCountries: ['US'] as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
  /** Stripe Tax codes: general tangible goods, and shipping. */
  productTaxCode: 'txcd_99999999',
  shippingTaxCode: 'txcd_92010001',
} as const;

/**
 * Sales tax is calculated by Stripe Tax on every gallery checkout unless it
 * is switched off with STRIPE_TAX=off. Stripe Tax must be activated on the
 * Stripe account (origin address and the states Mayells is registered in)
 * or Stripe refuses to create the session.
 */
export function isGallerySalesTaxEnabled(): boolean {
  return (process.env.STRIPE_TAX ?? '').trim().toLowerCase() !== 'off';
}
