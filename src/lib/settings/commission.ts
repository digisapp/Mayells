import { db } from '@/db';
import { automationSettings } from '@/db/schema';
import { FALLBACK_COMMISSION_PERCENT } from '@/lib/payouts/commission';
import { logger } from '@/lib/logger';

/**
 * The house commission rate to propose when a consignor has no agreed rate
 * yet — the same number settlement would fall back to, so an agreement can't
 * offer one rate while the payout calculates another. Read from Settings
 * (singleton row); a missing or unreadable row falls back to the shared
 * constant rather than a second hardcoded percentage.
 */
export async function getDefaultCommissionPercent(): Promise<number> {
  try {
    const [row] = await db
      .select({ percent: automationSettings.defaultCommissionPercent })
      .from(automationSettings)
      .limit(1);
    const percent = row?.percent;
    if (typeof percent === 'number' && percent > 0 && percent < 100) return percent;
  } catch (error) {
    logger.error('Failed to read the default commission rate', error);
  }
  return FALLBACK_COMMISSION_PERCENT;
}
