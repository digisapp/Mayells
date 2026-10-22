/**
 * Buy Now: reserve a gallery piece for the buyer and open Stripe Checkout.
 *
 * 1. Under a row lock on the lot, check it can be bought online and that no
 *    live invoice reserves it, then create the hold: a pending gallery
 *    invoice for the price plus shipping, with `holdExpiresAt`. The per-lot
 *    live-invoice unique index means a second buyer can't hold it too.
 * 2. Outside the transaction, create the Checkout session that expires with
 *    the hold (idempotent per hold, so a retried request gets the same
 *    session) and remember it on the invoice. If Stripe refuses, the hold is
 *    released straight away.
 *
 * The same buyer coming back while their hold is live returns to the same
 * session. A lapsed hold found here is released (once Stripe confirms it is
 * unpaid) and checkout starts afresh. Tax is not known until the buyer gives
 * an address on Stripe's page; the payment webhook copies Stripe's final
 * figures onto the invoice (see ./totals.ts).
 */

import Stripe from 'stripe';
import { db } from '@/db';
import { invoices, lots, type Lot } from '@/db/schema';
import { and, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { storedSessionAction } from '@/lib/stripe/reconcile';
import { findLiveInvoiceForLot, generateInvoiceNumber } from '@/lib/invoicing/generate-invoice';
import { isUniqueViolation } from '@/lib/auctions/db-errors';
import { BUSINESS } from '@/lib/config';
import { formatClockTime } from '@/lib/format/dates';
import { logger } from '@/lib/logger';
import { GALLERY_CHECKOUT, isGallerySalesTaxEnabled } from './config';
import { isActiveHold, isOnlinePurchasable } from './purchase-state';
import { releaseGalleryHold } from './holds';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

export interface CheckoutBuyer {
  id: string;
  email: string;
  stripeCustomerId: string | null;
}

export type CheckoutErrorCode =
  | 'NOT_FOUND'
  | 'NOT_AVAILABLE'
  | 'SOLD'
  | 'ON_HOLD'
  | 'RESERVED'
  | 'INVOICED'
  | 'OWN_LOT'
  | 'PROCESSING'
  | 'TOO_MANY_HOLDS'
  | 'UNAVAILABLE';

export interface CheckoutFailure {
  ok: false;
  status: number;
  code: CheckoutErrorCode;
  error: string;
  /** ON_HOLD: when the other buyer's hold lapses. */
  holdExpiresAt?: string;
  /** INVOICED: the buyer's own invoice, to pay instead. */
  invoiceToken?: string;
}

export type StartCheckoutResult = { ok: true; url: string } | CheckoutFailure;

type Invoice = typeof invoices.$inferSelect;

type Claim =
  | { kind: 'fresh' | 'mine'; hold: Invoice; lot: Lot }
  | { kind: 'lapsed'; hold: Invoice }
  | CheckoutFailure;

function fail(status: number, code: CheckoutErrorCode, error: string, extra: Partial<CheckoutFailure> = {}): CheckoutFailure {
  return { ok: false, status, code, error, ...extra };
}

const contactLine = `call ${BUSINESS.phone} or email ${BUSINESS.email}`;

const unavailable = () =>
  fail(503, 'UNAVAILABLE', `Online checkout isn't available right now. To buy this piece, ${contactLine}.`);

function onHold(until: Date) {
  return fail(
    409,
    'ON_HOLD',
    `Another collector is checking out this piece. If they don't complete the purchase, it is available again at ${formatClockTime(until)}.`,
    { holdExpiresAt: until.toISOString() },
  );
}

/** Lock the lot and either find the buyer's own hold or create a new one. */
async function claimHold(lotId: string, buyer: CheckoutBuyer, now: Date): Promise<Claim> {
  try {
    return await db.transaction(async (tx): Promise<Claim> => {
      const [lot] = await tx.select().from(lots).where(eq(lots.id, lotId)).for('update');
      if (!lot) return fail(404, 'NOT_FOUND', 'This piece could not be found.');
      if (lot.status === 'sold') return fail(409, 'SOLD', 'This piece has been sold.');

      const live = await findLiveInvoiceForLot(tx, lot.id);
      if (live) {
        if (live.holdExpiresAt) {
          if (live.status === 'pending' && isActiveHold(live, now)) {
            return live.buyerId === buyer.id ? { kind: 'mine', hold: live, lot } : onHold(live.holdExpiresAt);
          }
          return { kind: 'lapsed', hold: live };
        }
        return live.buyerId === buyer.id
          ? fail(409, 'INVOICED', 'This piece is reserved for you. Please pay from your invoice.', { invoiceToken: live.accessToken })
          : fail(409, 'RESERVED', 'This piece is reserved for another client.');
      }

      if (!isOnlinePurchasable(lot)) {
        return fail(409, 'NOT_AVAILABLE', `This piece can't be bought online. To buy it, ${contactLine}.`);
      }
      if (lot.sellerId && lot.sellerId === buyer.id) {
        return fail(403, 'OWN_LOT', 'You consigned this piece, so it can’t be bought from your account.');
      }

      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const [usage] = await tx
        .select({
          live: sql<number>`count(*) filter (where ${and(eq(invoices.status, 'pending'), gt(invoices.holdExpiresAt, now))})::int`,
          // Only checkouts that actually opened count: a hold released because
          // Stripe refused the session was our failure, not the buyer's.
          onThisPiece: sql<number>`count(*) filter (where ${and(eq(invoices.lotId, lot.id), gt(invoices.createdAt, dayAgo), isNotNull(invoices.stripeCheckoutSessionId))})::int`,
        })
        .from(invoices)
        .where(and(eq(invoices.buyerId, buyer.id), isNotNull(invoices.holdExpiresAt)));
      if ((usage?.live ?? 0) >= GALLERY_CHECKOUT.maxLiveHoldsPerBuyer) {
        return fail(429, 'TOO_MANY_HOLDS', 'You already have pieces reserved in checkout. Complete or leave one of those checkouts first.');
      }
      if ((usage?.onThisPiece ?? 0) >= GALLERY_CHECKOUT.maxHoldsPerPiecePerDay) {
        return fail(429, 'TOO_MANY_HOLDS', `You’ve started checkout on this piece several times today. To buy it, ${contactLine}.`);
      }

      // Whole seconds: Stripe's expires_at is in seconds and must match the
      // hold exactly, so a retried session request sends identical params.
      const holdExpiresAt = new Date(Math.floor(now.getTime() / 1000) * 1000 + GALLERY_CHECKOUT.holdMinutes * 60 * 1000);
      const price = lot.buyNowPrice!;
      const shipping = lot.shippingPrice!;
      const [hold] = await tx
        .insert(invoices)
        .values({
          invoiceNumber: generateInvoiceNumber(),
          source: 'gallery',
          buyerId: buyer.id,
          lotId: lot.id,
          hammerPrice: price,
          buyerPremium: 0,
          shippingCost: shipping,
          taxAmount: 0,
          totalAmount: price + shipping,
          dueDate: holdExpiresAt,
          holdExpiresAt,
        })
        .returning();
      return { kind: 'fresh', hold, lot };
    });
  } catch (err) {
    // The lot row lock serialises checkouts, so this is an invoice-number
    // collision or a hold made through another path a moment ago.
    if (isUniqueViolation(err)) {
      return fail(409, 'ON_HOLD', 'Someone else just started checkout on this piece. Please try again in a moment.');
    }
    throw err;
  }
}

function absoluteImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (/^https:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${APP_URL}${url}`;
  return null;
}

function sessionParams(hold: Invoice, lot: Lot, buyer: CheckoutBuyer): Stripe.Checkout.SessionCreateParams {
  const taxOn = isGallerySalesTaxEnabled();
  const holdExpiresAt = hold.holdExpiresAt!;
  const shipping = hold.shippingCost ?? 0;
  const image = absoluteImageUrl(lot.primaryImageUrl);
  const byline = lot.artist || lot.maker;
  const metadata = { invoiceId: hold.id, lotId: lot.id, source: 'gallery' };

  return {
    mode: 'payment',
    // Card only (wallets such as Apple Pay ride on it): the ledger records
    // these as credit_card, and a delayed method can fail after the hold.
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: hold.hammerPrice,
          ...(taxOn ? { tax_behavior: 'exclusive' as const } : {}),
          product_data: {
            name: lot.title,
            ...(byline ? { description: byline } : {}),
            ...(image ? { images: [image] } : {}),
            ...(taxOn ? { tax_code: GALLERY_CHECKOUT.productTaxCode } : {}),
            metadata: { lotId: lot.id },
          },
        },
      },
    ],
    shipping_address_collection: { allowed_countries: [...GALLERY_CHECKOUT.shippingCountries] },
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: shipping > 0 ? 'Insured shipping' : 'Complimentary insured shipping',
          fixed_amount: { amount: shipping, currency: 'usd' },
          ...(taxOn ? { tax_behavior: 'exclusive' as const, tax_code: GALLERY_CHECKOUT.shippingTaxCode } : {}),
        },
      },
    ],
    automatic_tax: { enabled: taxOn },
    phone_number_collection: { enabled: true },
    // Reuse the buyer's Stripe customer (saved card from bidder verification)
    // when there is one; Stripe rejects customer + customer_email together.
    // Stripe Tax needs the address typed here saved onto that customer.
    ...(buyer.stripeCustomerId
      ? {
          customer: buyer.stripeCustomerId,
          ...(taxOn ? { customer_update: { address: 'auto' as const, shipping: 'auto' as const } } : {}),
        }
      : { customer_email: buyer.email }),
    // The webhook reads the PaymentIntent's metadata to settle the invoice.
    payment_intent_data: { description: `Mayells Gallery: ${lot.title}`, metadata },
    metadata,
    custom_text: {
      submit: {
        message: `Reserved for you until ${formatClockTime(holdExpiresAt)}. Gallery sales are final, covered by our ${GALLERY_CHECKOUT.guaranteeDays}-day as-described guarantee (${APP_URL}/terms#gallery).`,
      },
    },
    success_url: `${APP_URL}/invoices/${hold.accessToken}?paid=1`,
    cancel_url: `${APP_URL}/gallery/${lot.slug || lot.id}?checkout=cancelled`,
    expires_at: Math.floor(holdExpiresAt.getTime() / 1000),
  };
}

/** Create (or, on a retry, get back) the hold's one Checkout session and remember it. */
async function createSessionForHold(hold: Invoice, lot: Lot, buyer: CheckoutBuyer): Promise<string> {
  const session = await stripe.checkout.sessions.create(sessionParams(hold, lot, buyer), {
    idempotencyKey: `gallery-checkout:${hold.id}`,
  });
  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  await db
    .update(invoices)
    .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
    .where(and(eq(invoices.id, hold.id), eq(invoices.status, 'pending')));
  return session.url;
}

function describeStripeError(err: unknown): string {
  if (err instanceof Stripe.errors.StripeError) return `${err.type}${err.code ? `/${err.code}` : ''}: ${err.message}`;
  return String(err);
}

export async function startGalleryCheckout(lotId: string, buyer: CheckoutBuyer): Promise<StartCheckoutResult> {
  if (!isStripeConfigured()) return unavailable();

  // Two passes at most: the second runs after a lapsed or dead hold was released.
  for (let attempt = 0; attempt < 2; attempt++) {
    const now = new Date();
    const claim = await claimHold(lotId, buyer, now);
    if ('ok' in claim) return claim;

    if (claim.kind === 'lapsed') {
      const outcome = await releaseGalleryHold(claim.hold, 'lapsed; released for a new checkout', { now });
      if (outcome === 'released' || outcome === 'not_held') continue;
      if (outcome === 'paying') {
        return claim.hold.buyerId === buyer.id
          ? fail(409, 'PROCESSING', 'Your payment for this piece is being processed. You don’t need to pay again.')
          : fail(409, 'RESERVED', 'This piece is being purchased by another collector.');
      }
      // Stripe hasn't confirmed the old checkout is closed yet.
      return fail(
        409,
        'ON_HOLD',
        claim.hold.buyerId === buyer.id
          ? 'Your last checkout for this piece is still closing. Please try again in a few minutes.'
          : 'This piece’s last checkout is still closing. Please try again in a few minutes.',
      );
    }

    const { hold, lot } = claim;

    if (claim.kind === 'mine' && hold.stripeCheckoutSessionId) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(hold.stripeCheckoutSessionId, {
          expand: ['payment_intent'],
        });
        const action = storedSessionAction(existing);
        if (action === 'reuse' && existing.url) return { ok: true, url: existing.url };
        if (action === 'processing') {
          return fail(409, 'PROCESSING', 'Your payment for this piece is being processed. You don’t need to pay again.');
        }
      } catch (err) {
        logger.warn('Buy Now: could not retrieve the stored checkout session', {
          invoiceId: hold.id,
          err: describeStripeError(err),
        });
        return unavailable();
      }
      // The session died before the hold did (its payment failed after
      // completing, or it was expired by hand): start a fresh hold.
      const outcome = await releaseGalleryHold(hold, 'checkout session ended early', { force: true });
      if (outcome === 'released' || outcome === 'not_held') continue;
      return outcome === 'paying'
        ? fail(409, 'PROCESSING', 'Your payment for this piece is being processed. You don’t need to pay again.')
        : unavailable();
    }

    // A new hold, or the buyer's own hold whose session id was never saved
    // (the idempotency key hands back the same session).
    try {
      const url = await createSessionForHold(hold, lot, buyer);
      logger.info('Buy Now checkout started', { invoiceId: hold.id, lotId: lot.id, buyerId: buyer.id });
      return { ok: true, url };
    } catch (err) {
      const detail = describeStripeError(err);
      const taxProblem = /tax/i.test(detail);
      logger.error(
        taxProblem
          ? 'Buy Now: Stripe refused the checkout session over tax — activate Stripe Tax (origin address + registrations) or set STRIPE_TAX=off'
          : 'Buy Now: Stripe refused the checkout session',
        err,
        { invoiceId: hold.id, lotId: lot.id, detail },
      );
      if (claim.kind === 'fresh') {
        await releaseGalleryHold(hold, `checkout could not start (${detail.slice(0, 160)})`, { force: true }).catch(
          (releaseErr) => logger.error('Buy Now: could not release a hold whose checkout failed', releaseErr, { invoiceId: hold.id }),
        );
      }
      return unavailable();
    }
  }

  return fail(409, 'ON_HOLD', 'This piece was just reserved by another collector. Please try again in a few minutes.');
}
