import { getTableColumns } from 'drizzle-orm';
import { lots } from '@/db/schema';
import type { Lot } from '@/db/schema';

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

/**
 * Public-safe projection of a lot row. Excludes auction-integrity and PII
 * fields — reservePrice (the seller's confidential floor), sellerId,
 * consignmentId, currentBidderId, winnerId, and internal AI valuation fields.
 * Every public endpoint that returns lot rows must go through this (or an
 * equivalent explicit column projection) — never `...lot` / `select()`.
 */
export function toPublicLot(lot: Lot) {
  return {
    id: lot.id,
    lotNumber: lot.lotNumber,
    title: lot.title,
    subtitle: lot.subtitle,
    description: lot.description,
    categoryId: lot.categoryId,
    subcategoryId: lot.subcategoryId,
    artist: lot.artist,
    maker: lot.maker,
    period: lot.period,
    circa: lot.circa,
    origin: lot.origin,
    medium: lot.medium,
    dimensions: lot.dimensions,
    weight: lot.weight,
    condition: lot.condition,
    conditionNotes: lot.conditionNotes,
    provenance: lot.provenance,
    literature: lot.literature,
    exhibited: lot.exhibited,
    status: lot.status,
    saleType: lot.saleType,
    buyNowPrice: lot.buyNowPrice,
    estimateLow: lot.estimateLow,
    estimateHigh: lot.estimateHigh,
    startingBid: lot.startingBid,
    currentBidAmount: lot.currentBidAmount,
    bidCount: lot.bidCount,
    hammerPrice: lot.hammerPrice,
    primaryImageUrl: lot.primaryImageUrl,
    imageCount: lot.imageCount,
    isFeatured: lot.isFeatured,
    isHighlight: lot.isHighlight,
    aiTags: lot.aiTags,
    slug: lot.slug,
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
  };
}

export type PublicLot = ReturnType<typeof toPublicLot>;

/**
 * The same public-safe field set as a Drizzle column map, for use directly in
 * `db.select(publicLotColumns)` so confidential columns never leave Postgres.
 */
export const publicLotColumns = (() => {
  const {
    reservePrice, sellerId, consignmentId, currentBidderId, winnerId,
    aiDescription, aiEstimateLow, aiEstimateHigh, aiConfidenceScore,
    ...publicCols
  } = getTableColumns(lots);
  void reservePrice; void sellerId; void consignmentId; void currentBidderId;
  void winnerId; void aiDescription; void aiEstimateLow; void aiEstimateHigh;
  void aiConfidenceScore;
  return publicCols;
})();
