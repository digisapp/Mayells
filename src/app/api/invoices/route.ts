import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { invoices, lots, auctions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userInvoices = await db
      .select({
        invoice: invoices,
        lot: {
          id: lots.id,
          title: lots.title,
          lotNumber: lots.lotNumber,
          primaryImageUrl: lots.primaryImageUrl,
          slug: lots.slug,
        },
        auction: {
          id: auctions.id,
          title: auctions.title,
          slug: auctions.slug,
        },
      })
      .from(invoices)
      .innerJoin(lots, eq(invoices.lotId, lots.id))
      .innerJoin(auctions, eq(invoices.auctionId, auctions.id))
      .where(eq(invoices.buyerId, user.id))
      .orderBy(desc(invoices.createdAt))
      .limit(100);

    return NextResponse.json({ data: userInvoices });
  } catch (error) {
    logger.error('Invoices error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
