import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { auctions, auctionLots, lots, bids } from '@/db/schema';
import { eq, lte, and, inArray, desc } from 'drizzle-orm';
import { generateInvoiceForWonLot } from '@/lib/invoicing/generate-invoice';
import { logger } from '@/lib/logger';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  // Verify cron secret — always required
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const results = {
    opened: 0,
    closed: 0,
    invoicesGenerated: 0,
    errors: [] as string[],
  };

  try {
    // 1. Open scheduled auctions whose bidding start time has passed
    const toOpen = await db
      .select()
      .from(auctions)
      .where(
        and(
          inArray(auctions.status, ['scheduled', 'preview']),
          lte(auctions.biddingStartsAt, now),
        ),
      );

    for (const auction of toOpen) {
      try {
        await db
          .update(auctions)
          .set({ status: 'open', updatedAt: now })
          .where(eq(auctions.id, auction.id));

        // Set lot statuses to in_auction
        const aLots = await db
          .select()
          .from(auctionLots)
          .where(eq(auctionLots.auctionId, auction.id));

        for (const al of aLots) {
          await db
            .update(lots)
            .set({ status: 'in_auction', updatedAt: now })
            .where(eq(lots.id, al.lotId));
        }

        results.opened++;
      } catch (err) {
        results.errors.push(`Failed to open auction ${auction.id}: ${err}`);
      }
    }

    // 2. Close open auctions whose bidding end time has passed
    const toClose = await db
      .select()
      .from(auctions)
      .where(
        and(
          inArray(auctions.status, ['open', 'live']),
          lte(auctions.biddingEndsAt, now),
        ),
      );

    for (const auction of toClose) {
      try {
        await db
          .update(auctions)
          .set({ status: 'closed', actualEndedAt: now, updatedAt: now })
          .where(eq(auctions.id, auction.id));

        // Process each lot in the auction
        const aLots = await db
          .select()
          .from(auctionLots)
          .where(eq(auctionLots.auctionId, auction.id));

        for (const al of aLots) {
          // Get the lot
          const [lot] = await db
            .select()
            .from(lots)
            .where(eq(lots.id, al.lotId))
            .limit(1);

          if (!lot || lot.bidCount === 0) {
            // No bids — unsold
            await db
              .update(lots)
              .set({ status: 'unsold', updatedAt: now })
              .where(eq(lots.id, al.lotId));
            continue;
          }

          // Check reserve
          if (lot.reservePrice && lot.currentBidAmount < lot.reservePrice) {
            await db
              .update(lots)
              .set({ status: 'unsold', updatedAt: now })
              .where(eq(lots.id, al.lotId));
            continue;
          }

          // Lot is sold — mark winning bid
          const [winningBid] = await db
            .select()
            .from(bids)
            .where(and(eq(bids.lotId, al.lotId), eq(bids.status, 'winning')))
            .orderBy(desc(bids.amount))
            .limit(1);

          if (winningBid) {
            // Update bid status to won
            await db
              .update(bids)
              .set({ status: 'won' })
              .where(eq(bids.id, winningBid.id));

            // Update lot with winner
            await db
              .update(lots)
              .set({
                winnerId: winningBid.bidderId,
                hammerPrice: winningBid.amount,
                status: 'sold',
                updatedAt: now,
              })
              .where(eq(lots.id, al.lotId));

            // Generate invoice
            try {
              await generateInvoiceForWonLot({
                auctionId: auction.id,
                lotId: al.lotId,
                buyerId: winningBid.bidderId,
                hammerPrice: winningBid.amount,
              });
              results.invoicesGenerated++;
            } catch (err) {
              results.errors.push(`Failed to generate invoice for lot ${al.lotId}: ${err}`);
            }
          }
        }

        // Mark auction as completed
        await db
          .update(auctions)
          .set({ status: 'completed', updatedAt: now })
          .where(eq(auctions.id, auction.id));

        results.closed++;
      } catch (err) {
        results.errors.push(`Failed to close auction ${auction.id}: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ...results,
    });
  } catch (error) {
    logger.error('Cron lifecycle error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
