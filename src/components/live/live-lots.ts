/**
 * Shapes and pure helpers shared by the live-auction page (server) and the
 * viewer (client). Kept free of React and DB imports so both sides, and the
 * unit tests, can use them.
 */

/** Where a lot stands in the running sale, as far as the viewer is concerned. */
export type LiveLotPhase = 'upcoming' | 'open' | 'closed' | 'sold' | 'passed';

export interface LiveLot {
  id: string;
  /** Used for bid/state API paths and the lot page link; falls back to id. */
  slug: string | null;
  lotNumber: number;
  title: string;
  imageUrl: string | null;
  currentBidAmount: number; // cents
  bidCount: number;
  estimateLow: number | null; // cents
  estimateHigh: number | null; // cents
  minNextBid: number; // cents
  phase: LiveLotPhase;
  closingAt: string | null; // ISO
  /** True when the signed-in viewer holds the current high bid. Never exposes who does otherwise. */
  isHighBidder: boolean;
}

export interface LiveViewer {
  signedIn: boolean;
}

/**
 * Mirrors the lot page's `isBiddableOnSite` rule (the auction is known to be
 * live here): open while the lot is in the sale and its close time is ahead.
 * An in-auction lot past its close time is awaiting settlement, so it reads as
 * closed rather than biddable.
 */
export function lotPhase(status: string, closingAt: Date | null, now: number): LiveLotPhase {
  if (status === 'sold') return 'sold';
  if (status === 'unsold') return 'passed';
  if (status === 'in_auction') return closingAt && closingAt.getTime() > now ? 'open' : 'closed';
  return 'upcoming';
}

/**
 * The lot "on the block": the open lot that closes soonest (lots in a live
 * sale close on a staggered schedule), lot number breaking ties. Falls back to
 * the first lot so the viewer always has something to show.
 */
export function pickCurrentLot(lots: LiveLot[]): LiveLot | undefined {
  let current: LiveLot | undefined;
  for (const lot of lots) {
    if (lot.phase !== 'open') continue;
    if (!current || compareOpenLots(lot, current) < 0) current = lot;
  }
  return current ?? lots[0];
}

function compareOpenLots(a: LiveLot, b: LiveLot): number {
  const aClose = a.closingAt ? Date.parse(a.closingAt) : Infinity;
  const bClose = b.closingAt ? Date.parse(b.closingAt) : Infinity;
  if (aClose !== bClose) return aClose - bClose;
  return a.lotNumber - b.lotNumber;
}

/** Path segment for the bid/state APIs and the lot page. */
export function lotRef(lot: Pick<LiveLot, 'id' | 'slug'>): string {
  return lot.slug ?? lot.id;
}

/** Sign-in link that brings the viewer straight back to the saleroom. */
export function liveSignInHref(auctionId: string): string {
  return `/login?next=${encodeURIComponent(`/live/${auctionId}`)}`;
}
