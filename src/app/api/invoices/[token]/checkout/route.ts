import { NextRequest, NextResponse } from 'next/server';
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

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
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

    const session = await stripe.checkout.sessions.create({
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
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error('Create invoice checkout session error', error);
    return NextResponse.json({ error: 'Unable to start checkout' }, { status: 500 });
  }
}
