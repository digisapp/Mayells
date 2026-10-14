/**
 * Where a sale takes bids. Each sale is bid in exactly one place: a sale with
 * a LiveAuctioneers link is bid there, every other sale on mayells.com. The two
 * bid ladders don't sync, so one lot must never take bids in both — the bid
 * route, the lot-state poll and the lot page all read this one rule.
 */
export type BiddingVenue = 'liveauctioneers' | 'mayells';

export function biddingVenue(auction: { liveauctioneersUrl?: string | null }): BiddingVenue {
  return auction.liveauctioneersUrl?.trim() ? 'liveauctioneers' : 'mayells';
}

export const isOnSiteBiddingSale = (auction: { liveauctioneersUrl?: string | null }) =>
  biddingVenue(auction) === 'mayells';

/**
 * What the lifecycle cron does to a LiveAuctioneers sale on this tick. Only
 * the sale's own status follows its schedule — `open` once bidding starts (the
 * catalogue then offers "Bid on LiveAuctioneers"), `closed` once it ends (the
 * sale reads as ended). Its lots are never opened, settled, invoiced, relisted
 * or returned automatically: they stay `approved` (public in a public sale)
 * until an admin records LiveAuctioneers' result for each one.
 *
 * A sale with no close time stays open until the admin ends it or records the
 * last result, so a live sale that runs long keeps its bid link up.
 */
export function liveAuctioneersSaleStep(
  sale: { status: string; biddingStartsAt: Date | null; biddingEndsAt: Date | null },
  now: Date,
): 'open' | 'close' | null {
  if ((sale.status === 'scheduled' || sale.status === 'preview') && sale.biddingStartsAt && sale.biddingStartsAt <= now) {
    return 'open';
  }
  if ((sale.status === 'open' || sale.status === 'live') && sale.biddingEndsAt && sale.biddingEndsAt <= now) {
    return 'close';
  }
  // Ended early (the live console's End parks a sale in closing).
  if (sale.status === 'closing') return 'close';
  return null;
}
