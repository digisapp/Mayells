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
