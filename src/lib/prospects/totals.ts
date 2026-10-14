import { sql, type SQL } from 'drizzle-orm';
import { uploadItems } from '@/db/schema';

/** Largest value an int4 column holds. */
export const INT4_MAX = 2_147_483_647;

/**
 * An integer-cents sum clamped to what the prospect's int4 total columns hold.
 * sum() over int columns is bigint, and casting a total above ~$21.4M
 * straight to int throws "integer out of range", failing the whole request.
 */
function clampedSum(aggregate: SQL): SQL<number> {
  return sql<number>`least(coalesce(${aggregate}, 0::bigint), ${sql.raw(String(INT4_MAX))}::bigint)::int`;
}

// The admin override wins over the AI estimate; a plain Accept sends no
// final* values, so the AI figure stands in for it.
const low = sql`coalesce(${uploadItems.finalEstimateLow}, ${uploadItems.aiEstimateLow})`;
const high = sql`coalesce(${uploadItems.finalEstimateHigh}, ${uploadItems.aiEstimateHigh})`;

/**
 * The prospect's cached review counters, recounted from its items: declined
 * items count as reviewed but not toward value. Select from uploadItems
 * filtered to one prospect.
 */
export function reviewCountsSelect() {
  return {
    reviewedItems: sql<number>`count(*) filter (where ${uploadItems.status} in ('accepted', 'declined', 'lot_created'))::int`,
    acceptedItems: sql<number>`count(*) filter (where ${uploadItems.status} in ('accepted', 'lot_created'))::int`,
    totalEstimateLow: clampedSum(sql`sum(${low}::bigint) filter (where ${uploadItems.status} != 'declined')`),
    totalEstimateHigh: clampedSum(sql`sum(${high}::bigint) filter (where ${uploadItems.status} != 'declined')`),
  };
}

/**
 * Count and estimate range of the items an agreement covers. Select from
 * uploadItems filtered to one prospect's accepted and lot_created items.
 */
export function acceptedTotalsSelect() {
  return {
    acceptedCount: sql<number>`count(*)::int`,
    totalEstimateLow: clampedSum(sql`sum(${low}::bigint)`),
    totalEstimateHigh: clampedSum(sql`sum(${high}::bigint)`),
  };
}
