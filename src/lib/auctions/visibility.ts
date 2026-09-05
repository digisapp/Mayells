import { auctions } from '@/db/schema';
import type { Auction } from '@/db/schema';

/**
 * Auction statuses the public may see. draft (unannounced plans) and
 * cancelled stay internal. Single source of truth for every public surface
 * that lists or resolves an auction row.
 */
export const PUBLIC_AUCTION_STATUSES = [
  'scheduled', 'preview', 'open', 'live', 'closing', 'closed', 'completed',
] as const;

export type AuctionStatus = (typeof auctions.status.enumValues)[number];

export function isPubliclyVisibleAuction(status: AuctionStatus | string | null | undefined): boolean {
  return !!status && (PUBLIC_AUCTION_STATUSES as readonly string[]).includes(status);
}

/** Public-safe auction shape: no livekitRoomName or admin user ids. */
export function toPublicAuction(a: Auction) {
  const { livekitRoomName, createdById, auctioneerId, ...publicFields } = a;
  void livekitRoomName; void createdById; void auctioneerId;
  return publicFields;
}

export type PublicAuction = ReturnType<typeof toPublicAuction>;
