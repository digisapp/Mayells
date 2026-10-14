/**
 * Which of a sale's dates may be cleared. The editor sends null for a date the
 * admin emptied; this says when that would leave the sale unable to run. A
 * published timed sale opens and settles on its start and close times, and
 * once bidding has opened every per-lot close time hangs off the sale's close
 * time (the settlement cron finds an open sale by it), so neither may vanish.
 * A live sale may have no close time until bidding opens; the preview date is
 * never required.
 */

const PUBLISHED_PRE_OPEN = ['scheduled', 'preview'];
const STARTED = ['open', 'live', 'closing', 'closed'];

export type ClearableDate = 'previewStartsAt' | 'biddingStartsAt' | 'biddingEndsAt';

const LABEL: Record<ClearableDate, string> = {
  previewStartsAt: 'preview',
  biddingStartsAt: 'bidding start',
  biddingEndsAt: 'bidding close',
};

/**
 * @param sale the sale as it will be after this update (status and format)
 * @returns why `field` can't be cleared, or null when it can
 */
export function clearedDateRefusal(sale: { status: string; type: string }, field: ClearableDate): string | null {
  if (field === 'previewStartsAt') return null;
  const needed =
    sale.type === 'timed'
      ? PUBLISHED_PRE_OPEN.includes(sale.status) || STARTED.includes(sale.status)
      : field === 'biddingEndsAt' && STARTED.includes(sale.status);
  if (!needed) return null;
  if (STARTED.includes(sale.status)) {
    return `Bidding has opened, so this sale's ${LABEL[field]} time can't be cleared.${field === 'biddingEndsAt' ? ' Set a new close time instead.' : ''}`;
  }
  return `A scheduled timed sale needs a ${LABEL[field]} time. Set a new one, or move the sale back to draft before clearing it.`;
}
