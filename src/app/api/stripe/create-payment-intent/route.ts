import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/config';
import { db } from '@/db';
import { invoices, payments, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { invoiceId } = await request.json();
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId required' }, { status: 400 });
    }

    // Get invoice and verify ownership
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.buyerId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (invoice.status !== 'pending') {
      return NextResponse.json({ error: 'Invoice is not pending' }, { status: 400 });
    }

    // Check if payment intent already exists
    if (invoice.stripePaymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(invoice.stripePaymentIntentId);
      if (existing.status !== 'canceled') {
        return NextResponse.json({
          clientSecret: existing.client_secret,
          paymentIntentId: existing.id,
        });
      }
    }

    // Get buyer info for Stripe
    const [buyer] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: invoice.totalAmount,
      currency: 'usd',
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        buyerId: user.id,
        lotId: invoice.lotId,
        auctionId: invoice.auctionId,
      },
      receipt_email: buyer?.email,
      description: `Mayell Invoice ${invoice.invoiceNumber}`,
    });

    // Save payment intent ID on invoice
    await db
      .update(invoices)
      .set({ stripePaymentIntentId: paymentIntent.id, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));

    // Create payment record
    await db.insert(payments).values({
      invoiceId,
      buyerId: user.id,
      amount: invoice.totalAmount,
      method: 'credit_card',
      status: 'processing',
      stripePaymentIntentId: paymentIntent.id,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    logger.error('Create payment intent error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
