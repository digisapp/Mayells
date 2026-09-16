/**
 * Release a lot that did not (or no longer does) result in a completed sale:
 * unsold at auction, invoice cancelled, or sale refunded.
 *
 * - Relist in gallery/shop at the reserve or low estimate (buy-now) when a
 *   price exists, so the item keeps working for the consignor.
 * - Otherwise mark it 'unsold' for the admin to return or re-auction.
 * - Update the linked consignment status accordingly.
 *
 * The denormalized bid state is zeroed in both branches: a later re-auction
 * must not display the old sale's current bid / bidder, and the upward-only
 * guard in the bid engine would otherwise block a lower fresh start from ever
 * correcting it.
 *
 * Shared by the auction-lifecycle cron (unsold at close) and the invoicing
 * unwind path (cancel / refund), so every release has identical semantics.
 */

import { db } from '@/db';
import { lots, consignments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface RelistableLot {
  id: string;
  estimateLow?: number | null;
  reservePrice?: number | null;
  consignmentId?: string | null;
}

export async function relistUnsoldLot(
  lot: RelistableLot,
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
  }

  // No price to relist at — mark as unsold, return to seller.
  await executor.update(lots).set({
    status: 'unsold',
    currentBidAmount: 0,
    currentBidderId: null,
    bidCount: 0,
    winnerId: null,
    hammerPrice: null,
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
