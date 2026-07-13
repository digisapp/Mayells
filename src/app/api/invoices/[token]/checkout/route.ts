import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { stripe } from '@/lib/stripe/config';
import { db } from '@/db';
import { invoices, lots, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

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

    // If a Checkout session was already created for this invoice, reuse it
    // rather than minting a second PaymentIntent — the strongest guard against a
    // double-charge from two tabs / a double-click.
    if (invoice.stripeCheckoutSessionId) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(invoice.stripeCheckoutSessionId);
        if (existing.status === 'open' && existing.url) {
          return NextResponse.json({ url: existing.url });
        }
        // 'complete' means the buyer already paid (or the card is being
        // captured) on that session — the invoice just hasn't flipped to 'paid'
        // yet because the webhook is in flight. Do NOT create a second session
        // (that would be a real double charge); tell the client to wait.
        if (existing.status === 'complete') {
          return NextResponse.json(
            { processing: true, message: 'Your payment is being processed.' },
            { status: 202 },
          );
        }
        // Otherwise ('expired') fall through and mint a fresh session.
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
      .select({ email: users.email })
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
    const idempotencyKey = `checkout:${invoice.id}:${bucket}`;
    // Two buckets out is always 30–60 min from now (satisfies Stripe's 30-min
    // minimum) AND is identical for every request in this bucket, so concurrent
    // first-clicks send matching params under the same idempotency key. The
    // stored-session reuse above prevents a *second* session next bucket.
    const expiresAt = (bucket + 2) * SESSION_WINDOW_SECONDS;

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
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
        customer_email: buyer?.email || undefined,
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
