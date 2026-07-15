import type { lots } from '@/db/schema';

/**
 * Lot statuses that are safe to show to the public. Anything else (draft,
 * pending_review, withdrawn, unsold) is internal/unpublished and must never be
 * rendered or listed on a public surface. Single source of truth so a new page
 * can't forget the filter and leak unpublished consignments.
 */
export const PUBLIC_LOT_STATUSES = ['for_sale', 'in_auction', 'sold'] as const;

export type PublicLotStatus = (typeof PUBLIC_LOT_STATUSES)[number];

type LotStatus = (typeof lots.status.enumValues)[number];

export function isPubliclyVisibleLot(status: LotStatus | string | null | undefined): boolean {
  return !!status && (PUBLIC_LOT_STATUSES as readonly string[]).includes(status);
}
