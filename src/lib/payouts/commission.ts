/**
 * Pure commission math for seller payouts. Kept free of DB/IO so it can be
 * unit-tested exhaustively (same pattern as bidding/verification.ts).
 *
 * Rate precedence:
 *   1. Commission agreed on the consignment record
 *   2. Commission agreed with the seller prospect
 *   3. High-value house rate when the hammer meets the threshold
 *   4. Default house rate
 */

export interface CommissionSettings {
  defaultCommissionPercent: number | null;
  highValueCommissionPercent: number | null;
  highValueThreshold: number | null;
}

export const FALLBACK_COMMISSION_PERCENT = 25;

/** Which agreement the resolved rate came from (persisted on the payout). */
export type CommissionSource = 'consignment' | 'prospect' | 'default';

function isValidPercent(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

export interface ResolveCommissionParams {
  hammerPrice: number;
  consignmentPercent?: number | null;
  prospectAgreedPercent?: number | null;
  settings?: CommissionSettings | null;
}

export function resolveCommission(params: ResolveCommissionParams): {
  percent: number;
  source: CommissionSource;
} {
  const { hammerPrice, consignmentPercent, prospectAgreedPercent, settings } = params;

  if (isValidPercent(consignmentPercent)) return { percent: consignmentPercent, source: 'consignment' };
  if (isValidPercent(prospectAgreedPercent)) return { percent: prospectAgreedPercent, source: 'prospect' };

  const threshold = settings?.highValueThreshold;
  if (
    isValidPercent(settings?.highValueCommissionPercent) &&
    typeof threshold === 'number' &&
    threshold > 0 &&
    hammerPrice >= threshold
  ) {
    return { percent: settings.highValueCommissionPercent, source: 'default' };
  }

  if (isValidPercent(settings?.defaultCommissionPercent)) {
    return { percent: settings.defaultCommissionPercent, source: 'default' };
  }

  return { percent: FALLBACK_COMMISSION_PERCENT, source: 'default' };
}

export function resolveCommissionPercent(params: ResolveCommissionParams): number {
  return resolveCommission(params).percent;
}

export interface PayoutAmounts {
  commissionAmount: number;
  netAmount: number;
}

/**
 * Split a hammer price (cents) into house commission and seller net.
 * Commission rounds half-up to the nearest cent; net is the exact remainder so
 * the two always sum to the hammer price.
 */
export function computePayoutAmounts(hammerPrice: number, commissionPercent: number): PayoutAmounts {
  if (!Number.isInteger(hammerPrice) || hammerPrice < 0) {
    throw new Error(`Invalid hammer price for payout: ${hammerPrice}`);
  }
  if (!isValidPercent(commissionPercent)) {
    throw new Error(`Invalid commission percent for payout: ${commissionPercent}`);
  }
  const commissionAmount = Math.round((hammerPrice * commissionPercent) / 100);
  return {
    commissionAmount,
    netAmount: hammerPrice - commissionAmount,
  };
}
