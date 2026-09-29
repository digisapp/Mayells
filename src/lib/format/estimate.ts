import { formatCurrency } from '@/types';

/**
 * One estimate format everywhere a lot is shown: "$35,000–$50,000".
 * `compact` drops the second "$" ("$35,000–50,000") so six-figure ranges fit
 * one line on a 2-up phone card. Returns null when there is no estimate.
 */
export function formatEstimate(
  low: number | null | undefined,
  high: number | null | undefined,
  opts: { compact?: boolean } = {},
): string | null {
  if (low && high) {
    const hi = formatCurrency(high);
    return `${formatCurrency(low)}–${opts.compact ? hi.replace(/^\$/, '') : hi}`;
  }
  if (low) return `${formatCurrency(low)}+`;
  if (high) return `Up to ${formatCurrency(high)}`;
  return null;
}
