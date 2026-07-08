import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { db } from '@/db';
import { auctions, auctionLots, lots, bids, maxBids, consignments, users, invoices } from '@/db/schema';
import { eq, lte, and, or, inArray, desc, asc } from 'drizzle-orm';
import { generateInvoiceForWonLot } from '@/lib/invoicing/generate-invoice';
import { initializeLotBidState } from '@/lib/bidding/bid-engine';
import { sendInvoiceNotification } from '@/lib/email/notifications';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

// Large auctions can take a while to settle; allow the full Vercel budget.
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

// Distributed lock so overlapping cron invocations (a slow run bleeding into
// the next 5-minute tick, or a manual POST alongside the scheduled GET) can't
// both settle the same lots and race on bid/lot status updates.
const LOCK_KEY = 'cron:auction-lifecycle:lock';
const LOCK_TTL_SECONDS = 290;

// Release the lock only if we still own it (avoid deleting a lock a later run
// acquired after ours expired).
const RELEASE_LOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

function isAuthorized(request: NextRequest): boolean {
  // Verify cron secret — always required
  if (!CRON_SECRET) return false;
  const authHeader = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${CRON_SECRET}`);
  const provided = Buffer.from(authHeader);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function handler(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockToken = randomUUID();
  const acquired = await redis.set(LOCK_KEY, lockToken, { nx: true, ex: LOCK_TTL_SECONDS });
  if (!acquired) {
    return NextResponse.json({ success: true, skipped: 'another lifecycle run is in progress' });
  }

  try {
    return await runLifecycle();
  } finally {
    await redis
      .eval(RELEASE_LOCK_LUA, [LOCK_KEY], [lockToken])
      .catch((err) => logger.error('Failed to release auction-lifecycle lock', err));
  }
}

async function runLifecycle() {
  const now = new Date();
  const results = {
    opened: 0,
    closed: 0,
    lotsSettled: 0,
    invoicesGenerated: 0,
    relistedToGallery: 0,
    returnedToSeller: 0,
    markedOverdue: 0,
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
        const aLots = await db
          .select({ auctionLot: auctionLots, lot: lots })
          .from(auctionLots)
          .innerJoin(lots, eq(lots.id, auctionLots.lotId))
          .where(eq(auctionLots.auctionId, auction.id))
          .orderBy(asc(auctionLots.lotNumber));

        const intervalSeconds = auction.lotClosingIntervalSeconds ?? 0;

        for (const [index, { auctionLot: al, lot }] of aLots.entries()) {
          await db
            .update(lots)
            .set({ status: 'in_auction', updatedAt: now })
            .where(eq(lots.id, al.lotId));

          // Staggered closing: each lot closes intervalSeconds after the previous one.
          // The bid engine's anti-snipe may push closingAt later as bids come in.
          if (auction.biddingEndsAt) {
            const closingAt = new Date(
              auction.biddingEndsAt.getTime() + index * intervalSeconds * 1000,
            );
            await db
              .update(auctionLots)
              .set({ closingAt })
              .where(eq(auctionLots.id, al.id));

            await initializeLotBidState(al.lotId, closingAt, lot.startingBid ?? 0);
          }
        }

        // Flip status last so a crash mid-initialization re-runs the (idempotent) loop
        await db
          .update(auctions)
          .set({ status: 'open', updatedAt: now })
          .where(eq(auctions.id, auction.id));

        results.opened++;
      } catch (err) {
        results.errors.push(`Failed to open auction ${auction.id}: ${err}`);
      }
    }

    // 2. Settle auctions past their end time, plus any auction stuck mid-settlement:
    //    - 'closing' is set by the live auction end route (auctioneer ended early)
    //    - 'closed' means a previous run started settling but didn't finish
    const toSettle = await db
      .select()
      .from(auctions)
      .where(
        or(
          and(
            inArray(auctions.status, ['open', 'live']),
            lte(auctions.biddingEndsAt, now),
          ),
          inArray(auctions.status, ['closing', 'closed']),
        ),
      );

    for (const auction of toSettle) {
      try {
        if (auction.status !== 'closed') {
          await db
            .update(auctions)
            .set({
              status: 'closed',
              actualEndedAt: auction.actualEndedAt ?? now,
              updatedAt: now,
            })
            .where(eq(auctions.id, auction.id));
        }

        const aLots = await db
          .select({ auctionLot: auctionLots, lot: lots })
          .from(auctionLots)
          .innerJoin(lots, eq(lots.id, auctionLots.lotId))
          .where(eq(auctionLots.auctionId, auction.id))
          .orderBy(asc(auctionLots.lotNumber));

        let unsettledRemaining = 0;

        for (const { auctionLot: al, lot } of aLots) {
          // Already settled (sold / relisted / returned) — idempotent skip
          if (lot.status !== 'in_auction') continue;

          // Respect per-lot close times (staggered closing + anti-snipe extensions)
          const effectiveCloseAt =
            al.closingAt ?? auction.biddingEndsAt ?? auction.actualEndedAt;
          if (effectiveCloseAt && effectiveCloseAt > now) {
            unsettledRemaining++;
            continue;
          }

          try {
            // Settle each lot atomically: choosing the winner, marking the
            // winning/outbid bids, updating the lot, generating the invoice,
            // and deactivating max bids all commit together or not at all. A
            // crash mid-settlement can no longer leave a lot 'sold' with no
            // invoice (which the idempotent skip above would never retry).
            const settlement = await db.transaction(async (tx) => {
              // Highest active bid wins; earliest bid wins amount ties
              const [winningBid] = await tx
                .select()
                .from(bids)
                .where(and(eq(bids.lotId, al.lotId), eq(bids.status, 'active')))
                .orderBy(desc(bids.amount), asc(bids.createdAt))
                .limit(1);

              const reserveMet =
                !lot.reservePrice || (winningBid && winningBid.amount >= lot.reservePrice);

              let outcome: 'sold' | 'relisted' | 'returned';
              let invoice: Awaited<ReturnType<typeof generateInvoiceForWonLot>> | null = null;

              if (winningBid && reserveMet) {
                await tx
                  .update(bids)
                  .set({ status: 'winning' })
                  .where(eq(bids.id, winningBid.id));

                await tx
                  .update(lots)
                  .set({
                    winnerId: winningBid.bidderId,
                    hammerPrice: winningBid.amount,
                    status: 'sold',
                    updatedAt: now,
                  })
                  .where(eq(lots.id, al.lotId));

                invoice = await generateInvoiceForWonLot(
                  {
                    auctionId: auction.id,
                    lotId: al.lotId,
                    buyerId: winningBid.bidderId,
                    hammerPrice: winningBid.amount,
                  },
                  tx,
                );
                outcome = 'sold';
              } else {
                // Unsold (no bids or reserve not met) — relist or return
                outcome = await relistUnsoldLot(lot, now, tx);
              }

              // Demote remaining active bids to outbid (winner is 'winning')
              await tx
                .update(bids)
                .set({ status: 'outbid' })
                .where(and(eq(bids.lotId, al.lotId), eq(bids.status, 'active')));

              // Retire any max bids for this lot so they can never fire in a
              // future re-auction on behalf of this sale's bidders.
              await tx
                .update(maxBids)
                .set({ isActive: false, updatedAt: now })
                .where(and(eq(maxBids.lotId, al.lotId), eq(maxBids.isActive, true)));

              return { outcome, invoice, winnerId: winningBid?.bidderId };
            });

            if (settlement.outcome === 'sold') results.invoicesGenerated++;
            if (settlement.outcome === 'relisted') results.relistedToGallery++;
            if (settlement.outcome === 'returned') results.returnedToSeller++;

            // Email the buyer their invoice (with the pay link) AFTER the
            // settlement commits — a send failure must not roll back the sale.
            // Only send when this run created the invoice (invoice.paidAt is
            // null on a fresh one), so idempotent re-runs don't re-email.
            if (
              settlement.outcome === 'sold' &&
              settlement.invoice &&
              !settlement.invoice.paidAt &&
              settlement.winnerId
            ) {
              try {
                const [buyer] = await db
                  .select({ email: users.email })
                  .from(users)
                  .where(eq(users.id, settlement.winnerId))
                  .limit(1);
                if (buyer?.email) {
                  await sendInvoiceNotification({
                    email: buyer.email,
                    lotTitle: lot.title,
                    invoiceNumber: settlement.invoice.invoiceNumber,
                    totalAmount: settlement.invoice.totalAmount,
                    dueDate: settlement.invoice.dueDate,
                    accessToken: settlement.invoice.accessToken,
                  });
                }
              } catch (err) {
                results.errors.push(`Failed to email invoice for lot ${al.lotId}: ${err}`);
              }
            }

            // Clean up Redis bid state so a relist starts fresh
            try {
              await redis.del(
                `bid:lot:${al.lotId}:current`,
                `bid:lot:${al.lotId}:current:bid_count`,
                `bid:lot:${al.lotId}:close_time`,
              );
            } catch (err) {
              results.errors.push(`Failed to clear Redis bid state for lot ${al.lotId}: ${err}`);
            }

            results.lotsSettled++;
          } catch (err) {
            unsettledRemaining++;
            results.errors.push(`Failed to settle lot ${al.lotId}: ${err}`);
          }
        }

        // Mark auction completed only once every lot has been settled
        if (unsettledRemaining === 0) {
          await db
            .update(auctions)
            .set({ status: 'completed', updatedAt: now })
            .where(eq(auctions.id, auction.id));

          results.closed++;
        }
      } catch (err) {
        results.errors.push(`Failed to close auction ${auction.id}: ${err}`);
      }
    }

    // 3. Flip unpaid invoices past their due date to 'overdue'.
    try {
      const overdue = await db
        .update(invoices)
        .set({ status: 'overdue', updatedAt: now })
        .where(and(eq(invoices.status, 'pending'), lte(invoices.dueDate, now)))
        .returning({ id: invoices.id });
      results.markedOverdue = overdue.length;
    } catch (err) {
      results.errors.push(`Failed to mark overdue invoices: ${err}`);
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

// Vercel cron invokes with GET; keep POST for manual/legacy triggers
export { handler as GET, handler as POST };

/**
 * Handle unsold lots after auction closes:
 * - Relist in gallery/shop at low estimate or reserve price (buy-now)
 * - Or return to seller if no estimate available
 * - Update consignment status accordingly
 */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function relistUnsoldLot(
  lot: { id: string; estimateLow?: number | null; reservePrice?: number | null; consignmentId?: string | null },
  now: Date,
  executor: Executor = db,
): Promise<'relisted' | 'returned'> {
  const buyNowPrice = lot.reservePrice || lot.estimateLow;

  if (buyNowPrice && buyNowPrice > 0) {
    // Relist as gallery item (buy-now) at reserve or low estimate
    await executor.update(lots).set({
      status: 'for_sale',
      saleType: 'gallery',
      buyNowPrice: buyNowPrice,
      currentBidAmount: 0,
      currentBidderId: null,
      bidCount: 0,
      winnerId: null,
      hammerPrice: null,
      updatedAt: now,
    }).where(eq(lots.id, lot.id));

    logger.info('Unsold lot relisted in gallery', {
      lotId: lot.id,
      buyNowPrice,
    });

    // Update consignment if linked
    if (lot.consignmentId) {
      await executor.update(consignments).set({
        status: 'listed',
        reviewNotes: `Unsold at auction — relisted in gallery at $${(buyNowPrice / 100).toLocaleString()}`,
        updatedAt: now,
      }).where(eq(consignments.id, lot.consignmentId));
    }

    return 'relisted';
  } else {
    // No price to relist at — mark as unsold, return to seller
    await executor.update(lots).set({
      status: 'unsold',
      updatedAt: now,
    }).where(eq(lots.id, lot.id));

    if (lot.consignmentId) {
      await executor.update(consignments).set({
        status: 'returned',
        reviewNotes: 'Unsold at auction — returned to seller',
        updatedAt: now,
      }).where(eq(consignments.id, lot.consignmentId));
    }

    return 'returned';
  }
}
