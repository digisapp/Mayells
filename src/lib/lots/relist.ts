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
  saleType?: string | null;
  buyNowPrice?: number | null;
}

/**
 * The price a released lot goes back on sale at. A gallery piece whose sale
 * was undone keeps the asking price it was bought at; an auction lot is
 * offered at its reserve, else its low estimate.
 */
export function relistPrice(lot: RelistableLot): number | null {
  if (lot.saleType === 'gallery' && lot.buyNowPrice && lot.buyNowPrice > 0) return lot.buyNowPrice;
  return lot.reservePrice || lot.estimateLow || null;
}

export async function relistUnsoldLot(
  lot: RelistableLot,
  now: Date,
  executor: Executor = db,
): Promise<'relisted' | 'returned'> {
  const buyNowPrice = relistPrice(lot);

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
        reviewNotes: lot.saleType === 'gallery'
          ? `Gallery sale undone — back on sale at $${(buyNowPrice / 100).toLocaleString()}`
          : `Unsold at auction — relisted in gallery at $${(buyNowPrice / 100).toLocaleString()}`,
        updatedAt: now,
      }).where(eq(consignments.id, lot.consignmentId));
    }

    return 'relisted';
  }

  // No price to relist at — mark as unsold, return to seller.
  return returnUnsoldLot(lot, now, executor);
}

/**
 * A gallery or private-sale piece whose sale was undone (refunded before it
 * left us) goes straight back on sale as it was listed: same sale type, same
 * asking price, or still price-on-request. Unlike an unsold auction lot it is
 * never re-priced from its reserve or returned to the consignor.
 */
export async function relistDirectSaleLot(
  lot: RelistableLot,
  now: Date,
  executor: Executor = db,
): Promise<'relisted'> {
  await executor.update(lots).set({
    status: 'for_sale',
    currentBidAmount: 0,
    currentBidderId: null,
    bidCount: 0,
    winnerId: null,
    hammerPrice: null,
    updatedAt: now,
  }).where(eq(lots.id, lot.id));

  if (lot.consignmentId) {
    await executor.update(consignments).set({
      status: 'listed',
      reviewNotes: 'Gallery sale undone — back on sale',
      updatedAt: now,
    }).where(eq(consignments.id, lot.consignmentId));
  }

  logger.info('Gallery sale undone — piece back on sale', { lotId: lot.id });
  return 'relisted';
}

/**
 * The return path on its own: the lot goes `unsold` (off every public
 * surface) and its consignment is marked returned to the seller. Also used
 * when an admin chooses to return an unsold LiveAuctioneers lot instead of
 * relisting it.
 */
export async function returnUnsoldLot(
  lot: RelistableLot,
  now: Date,
  executor: Executor = db,
): Promise<'returned'> {
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
