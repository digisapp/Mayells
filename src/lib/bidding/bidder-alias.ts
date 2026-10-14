import { createHmac } from 'crypto';

/**
 * Opaque, stable aliases for bidders on public surfaces (bid history labels,
 * live-room identities). Keyed with a server secret: a plain hash of
 * `lotId:bidderId` can be recomputed by anyone holding a user id, which links
 * a "Bidder 3f9a1c" label back to an account. Never a NEXT_PUBLIC value.
 */
function aliasSecret(): string {
  const secret = process.env.BIDDER_ALIAS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    // An empty key would degrade to the linkable plain hash; refuse instead.
    throw new Error('BIDDER_ALIAS_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set to label bidders');
  }
  return secret;
}

/**
 * Hex alias for `userId` within `scope` (a lot, a live room). Different
 * scopes give unrelated aliases, so labels can't be joined across lots.
 */
export function bidderAlias(scope: string, userId: string, length = 6): string {
  return createHmac('sha256', aliasSecret()).update(`${scope}:${userId}`).digest('hex').slice(0, length);
}

/** "Bidder 3f9a1c" — the public bid-history label for one bidder on one lot. */
export function publicBidderLabel(lotId: string, bidderId: string): string {
  return `Bidder ${bidderAlias(lotId, bidderId)}`;
}

/** Per-room LiveKit identity for a viewer: stable for the sale, never the user id. */
export function liveViewerIdentity(auctionId: string, userId: string): string {
  return `viewer-${bidderAlias(`live:${auctionId}`, userId, 16)}`;
}

/**
 * What other people in a live room see for a participant: their chosen
 * display name, else their paddle, else a short alias. Never the legal name.
 */
export function liveDisplayName(
  auctionId: string,
  userId: string,
  profile: { displayName?: string | null; paddleNumber?: string | null } | null | undefined,
): string {
  const displayName = profile?.displayName?.trim();
  if (displayName) return displayName;
  if (profile?.paddleNumber) return `Paddle ${profile.paddleNumber}`;
  return `Bidder ${bidderAlias(`live:${auctionId}`, userId)}`;
}
