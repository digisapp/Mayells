import { z } from 'zod';
import { MAX_MONEY_CENTS } from '@/lib/validation/schemas';
import { biddingVenue } from '@/lib/bidding/venue';

/**
 * Recording LiveAuctioneers results. A sale with a LiveAuctioneers link is bid
 * there, so nothing on mayells.com knows who won or for how much; an admin
 * enters each lot's outcome once LiveAuctioneers reports it. Pure rules only
 * (shared by the API route and the admin page) — no database access here.
 *
 * No invoice or payout is raised for these lots: LiveAuctioneers collects from
 * the buyer, and the consignor is settled outside the site for now.
 */

/** Sale statuses in which results can be recorded: bidding has started. */
export const LA_RESULT_SALE_STATUSES = ['open', 'live', 'closing', 'closed'] as const;

/**
 * Lot statuses still awaiting a result. `in_auction` only appears on sales
 * opened before LiveAuctioneers sales stopped being opened on site. Lots in
 * other pre-sale states (draft, pending review) were never public, so they
 * were not offered and do not hold the sale open.
 */
export const LA_AWAITING_RESULT_LOT_STATUSES = ['approved', 'in_auction'] as const;

export const laResultSchema = z.discriminatedUnion('outcome', [
  z.object({
    lotId: z.string().uuid(),
    outcome: z.literal('sold'),
    // Hammer price in cents, before buyer's premium.
    hammerPrice: z.number().int().positive('Enter the hammer price').max(MAX_MONEY_CENTS, 'Amount is too large'),
  }),
  // Unsold: relist in the gallery at the reserve / low estimate…
  z.object({ lotId: z.string().uuid(), outcome: z.literal('relist') }),
  // …or send it back to the consignor.
  z.object({ lotId: z.string().uuid(), outcome: z.literal('return') }),
]);

export type LaResultInput = z.infer<typeof laResultSchema>;

/** Why results can't be recorded for this sale right now, or null when they can. */
export function laSaleRefusal(sale: { status: string; liveauctioneersUrl?: string | null }): string | null {
  if (biddingVenue(sale) !== 'liveauctioneers') {
    return 'This sale is bid on mayells.com; its lots settle automatically when bidding ends.';
  }
  if (sale.status === 'completed' || sale.status === 'cancelled') {
    return `This sale is ${sale.status}; its results can no longer change.`;
  }
  if (!(LA_RESULT_SALE_STATUSES as readonly string[]).includes(sale.status)) {
    return 'Results can be recorded once bidding has opened on LiveAuctioneers.';
  }
  return null;
}

export type LaResultDecision =
  | { kind: 'apply' }
  // The same result is already on file (a retried request): report success, change nothing.
  | { kind: 'already' }
  // A sold lot's hammer price re-entered with a different amount: a typo fix.
  | { kind: 'correct' }
  | { kind: 'refuse'; error: string };

/**
 * What to do with one result for a lot in its current state. Idempotent: the
 * same result twice is a no-op. A sold lot's hammer price can be corrected
 * (nothing downstream is raised from it); any other change to a recorded
 * result is refused, since a relisted lot may already have been bought.
 */
export function decideLaResult(
  lot: {
    status: string;
    hammerPrice: number | null;
    reservePrice?: number | null;
    estimateLow?: number | null;
    saleType?: string | null;
    winnerId?: string | null;
  },
  input: Pick<LaResultInput, 'outcome'> & { hammerPrice?: number },
): LaResultDecision {
  if ((LA_AWAITING_RESULT_LOT_STATUSES as readonly string[]).includes(lot.status)) return { kind: 'apply' };

  const relistPrice = lot.reservePrice || lot.estimateLow;
  const same =
    (input.outcome === 'sold' && lot.status === 'sold' && lot.hammerPrice === input.hammerPrice) ||
    (input.outcome === 'relist' && lot.status === 'for_sale') ||
    // A relist with no price to list at falls back to a return.
    (input.outcome === 'relist' && lot.status === 'unsold' && !relistPrice) ||
    (input.outcome === 'return' && lot.status === 'unsold');
  if (same) return { kind: 'already' };
  if (input.outcome === 'sold' && lot.status === 'sold') {
    // Only a sale recorded here: still an auction lot with no Mayells buyer.
    // A lot relisted from this sale and then bought in the gallery (or won in
    // a later sale) has its own invoice; its price isn't this sale's to edit.
    if (lot.saleType === 'auction' && !lot.winnerId) return { kind: 'correct' };
    return { kind: 'refuse', error: 'This lot was sold after this sale, on mayells.com; its price can’t be changed here.' };
  }

  const recorded: Record<string, string> = {
    sold: 'sold',
    for_sale: 'relisted in the gallery',
    unsold: 'returned to the consignor',
  };
  if (recorded[lot.status]) {
    return { kind: 'refuse', error: `A result is already recorded for this lot (${recorded[lot.status]}).` };
  }
  return {
    kind: 'refuse',
    error: lot.status === 'withdrawn'
      ? 'This lot was withdrawn from the sale.'
      : `This lot is ${lot.status.replace(/_/g, ' ')} and was not offered in the sale.`,
  };
}

/**
 * Dollars typed by an admin ("1250", "$1,250.50") → cents, or null when it
 * isn't a positive amount.
 */
export function parseHammerDollars(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return cents > 0 && cents <= MAX_MONEY_CENTS ? cents : null;
}
