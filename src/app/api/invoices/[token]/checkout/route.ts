import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import type Stripe from 'stripe';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { storedSessionAction } from '@/lib/stripe/reconcile';
import { BUSINESS } from '@/lib/config';
import { db } from '@/db';
import { invoices, lots, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { startGalleryCheckout } from '@/lib/gallery/checkout';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

// Where we will ship. Keep in step with the carriers configured in Shippo.
const SHIPPING_COUNTRIES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] = [
  'US', 'CA', 'GB', 'FR', 'DE', 'IT', 'CH',
];

/**
 * Create a Stripe Checkout session to pay an invoice.
 *
 * Access is by the invoice's unguessable access token (no on-site account
 * required) — the same model as the seller upload links. The amount is always
 * taken from the invoice on the server; nothing about price is trusted from the
 * client. The resulting PaymentIntent carries { invoiceId, lotId } metadata,
 * which the Stripe webhook uses to mark the invoice paid.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!UUID_RE.test(token)) {
      return NextResponse.json({ error: 'Invalid invoice link' }, { status: 400 });
    }

    const ip = getClientIp(req);
    const { success } = await rateLimit(`invoice:checkout:${ip}`, { maxRequests: 20, windowSeconds: 3600 });
    if (!success) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.accessToken, token))
      .limit(1);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.status !== 'pending' && invoice.status !== 'overdue') {
      // Already paid / refunded / cancelled — nothing to charge.
      return NextResponse.json(
        { error: `This invoice is ${invoice.status} and cannot be paid.` },
        { status: 409 },
      );
    }

    // No Stripe key (card payments not set up): say so plainly rather than
    // failing inside the SDK with a 500 "try again".
    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          error: `Online card payment isn't available right now. Please contact us at ${BUSINESS.phone} or ${BUSINESS.email} to pay by wire transfer.`,
        },
        { status: 503 },
      );
    }

    // A Buy Now hold is paid through its own checkout (shipping options,
    // Stripe Tax, expiry with the hold): send the buyer back into it.
    if (invoice.holdExpiresAt) {
      const [holder] = await db
        .select({ id: users.id, email: users.email, stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, invoice.buyerId))
        .limit(1);
      if (!holder) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      const result = await startGalleryCheckout(invoice.lotId, holder);
      if (result.ok) return NextResponse.json({ url: result.url });
      if (result.code === 'PROCESSING') {
        return NextResponse.json({ processing: true, message: result.error }, { status: 202 });
      }
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }

    // If a Checkout session was already created for this invoice, reuse it
    // rather than minting a second PaymentIntent — the strongest guard against a
    // double-charge from two tabs / a double-click.
    let replacingSessionId: string | null = null;
    if (invoice.stripeCheckoutSessionId) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(invoice.stripeCheckoutSessionId, {
          expand: ['payment_intent'],
        });
        const action = storedSessionAction(existing);
        if (action === 'reuse' && existing.url) {
          return NextResponse.json({ url: existing.url });
        }
        // 'complete' with a live payment means the buyer already paid (or the
        // payment is settling) on that session — the invoice just hasn't
        // flipped to 'paid' yet because the webhook is in flight. Do NOT create
        // a second session (that would be a real double charge); tell the
        // client to wait.
        if (action === 'processing') {
          return NextResponse.json(
            { processing: true, message: 'Your payment is being processed.' },
            { status: 202 },
          );
        }
        // Expired, or completed but its payment failed afterwards: mint a
        // fresh session.
        replacingSessionId = existing.id;
        if (existing.status === 'complete') {
          logger.info('Stored checkout session completed but its payment failed — minting a new one', {
            invoiceId: invoice.id,
            sessionId: existing.id,
          });
        }
      } catch (err) {
        logger.warn('Failed to retrieve stored checkout session — creating a new one', {
          invoiceId: invoice.id,
          err: String(err),
        });
      }
    }

    const [lot] = await db
      .select({ title: lots.title })
      .from(lots)
      .where(eq(lots.id, invoice.lotId))
      .limit(1);

    const [buyer] = await db
      .select({ email: users.email, stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, invoice.buyerId))
      .limit(1);

    // Prevent double-charging from a double-click or two open tabs: send a
    // stable Stripe idempotency key bucketed to the 30-minute session lifetime,
    // so two concurrent first-clicks return the SAME session/PaymentIntent. The
    // key's request params must be IDENTICAL between those concurrent calls or
    // Stripe rejects the retry with an idempotency error — so expires_at is
    // derived from the bucket boundary (deterministic), not Date.now().
    const SESSION_WINDOW_SECONDS = 30 * 60;
    const bucket = Math.floor(Date.now() / 1000 / SESSION_WINDOW_SECONDS);
    // A replacement names the session it replaces: within the same bucket the
    // plain key would hand back that dead session from Stripe's cache.
    const idempotencyKey = `checkout:${invoice.id}:${bucket}${replacingSessionId ? `:after:${replacingSessionId}` : ''}`;
    // Two buckets out is always 30–60 min from now (satisfies Stripe's 30-min
    // minimum) AND is identical for every request in this bucket, so concurrent
    // first-clicks send matching params under the same idempotency key. The
    // stored-session reuse above prevents a *second* session next bucket.
    const expiresAt = (bucket + 2) * SESSION_WINDOW_SECONDS;

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        // Card only: the ledger records these as credit_card, and a delayed
        // method (ACH) can fail days after the session completes.
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Invoice ${invoice.invoiceNumber}${lot?.title ? ` — ${lot.title}` : ''}`,
              },
              unit_amount: invoice.totalAmount,
            },
            quantity: 1,
          },
        ],
        // Metadata must live on the PaymentIntent — that's what the webhook reads.
        payment_intent_data: {
          metadata: { invoiceId: invoice.id, lotId: invoice.lotId },
        },
        metadata: { invoiceId: invoice.id, lotId: invoice.lotId },
        // Reuse the bidder's Stripe customer (saved card from verification)
        // when we have one; Stripe rejects customer + customer_email together.
        ...(buyer?.stripeCustomerId
          ? { customer: buyer.stripeCustomerId }
          : { customer_email: buyer?.email || undefined }),
        // Collect the ship-to address on Stripe's page — the webhook copies it
        // onto the invoice so the shipment is created with a real destination.
        shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
        phone_number_collection: { enabled: true },
        success_url: `${APP_URL}/invoices/${token}?paid=1`,
        cancel_url: `${APP_URL}/invoices/${token}`,
        expires_at: expiresAt,
      },
      { idempotencyKey },
    );

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    // Remember the session so subsequent clicks reuse it while it's open.
    await db
      .update(invoices)
      .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id));

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error('Create invoice checkout session error', error);
    return NextResponse.json({ error: 'Unable to start checkout' }, { status: 500 });
  }
}
