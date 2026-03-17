import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { lots, invoices } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

const BUYER_PREMIUM_RATE = 0.20; // 20% buyer's premium

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to purchase' }, { status: 401 });
    }

    const { lotId } = await req.json();
    if (!lotId) {
      return NextResponse.json({ error: 'Lot ID is required' }, { status: 400 });
    }

    // Get the lot
    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    if (lot.saleType !== 'gallery') {
      return NextResponse.json({ error: 'This lot is not available for gallery purchase' }, { status: 400 });
    }

    if (lot.status !== 'for_sale') {
      return NextResponse.json({ error: 'This lot is no longer available' }, { status: 400 });
    }

    if (!lot.buyNowPrice) {
      return NextResponse.json({ error: 'No price set for this lot' }, { status: 400 });
    }

    // Calculate totals
    const hammerPrice = lot.buyNowPrice;
    const buyerPremium = Math.round(hammerPrice * BUYER_PREMIUM_RATE);
    const totalAmount = hammerPrice + buyerPremium;

    // Generate invoice number
    const invoiceNumber = `GAL-${Date.now().toString(36).toUpperCase()}`;

    // Atomic transaction — prevents double-selling
    const invoice = await db.transaction(async (tx) => {
      // Re-check availability inside transaction
      const [freshLot] = await tx.select({ status: lots.status }).from(lots).where(eq(lots.id, lotId)).limit(1);
      if (!freshLot || freshLot.status !== 'for_sale') {
        throw new Error('LOT_UNAVAILABLE');
      }

      // Mark lot as sold first (locks the row)
      await tx.update(lots).set({
        status: 'sold',
        winnerId: user.id,
        hammerPrice,
        updatedAt: new Date(),
      }).where(eq(lots.id, lotId));

      // Create invoice
      const [inv] = await tx.insert(invoices).values({
        invoiceNumber,
        buyerId: user.id,
        lotId: lot.id,
        hammerPrice,
        buyerPremium,
        totalAmount,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }).returning();

      return inv;
    });

    return NextResponse.json({
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'LOT_UNAVAILABLE') {
      return NextResponse.json({ error: 'This lot is no longer available' }, { status: 409 });
    }
    logger.error('Gallery purchase error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
