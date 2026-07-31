/**
 * Consignor portal — the no-login, tokenized status page at /consignor/[token]
 * where a consignor can follow their items from cataloging through sale and
 * payout. Keyed by users.portal_token (works for shadow sellers too, so
 * consignors never need an account to have visibility).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guard before querying: a malformed token must 404, not throw a pg error. */
export function isValidPortalToken(token: string): boolean {
  return UUID_RE.test(token);
}

export function portalUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/consignor/${token}`;
}

/** Consignor-facing label for a lot's internal status. */
export function consignorStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
    case 'pending_review':
    case 'approved':
      return 'In preparation';
    case 'for_sale':
      return 'For sale in gallery';
    case 'in_auction':
      return 'In auction';
    case 'sold':
      return 'Sold';
    case 'unsold':
      return 'Not sold — we will be in touch';
    case 'withdrawn':
      return 'Withdrawn';
    default:
      return 'In preparation';
  }
}

export interface ConsignorSummary {
  totalItems: number;
  soldItems: number;
  /** Cents, across non-cancelled payouts. */
  paidNet: number;
  pendingNet: number;
}

export function summarizeConsignor(
  lots: { status: string }[],
  payouts: { status: string; netAmount: number }[],
): ConsignorSummary {
  const summary: ConsignorSummary = {
    totalItems: lots.length,
    soldItems: lots.filter((l) => l.status === 'sold').length,
    paidNet: 0,
    pendingNet: 0,
  };
  for (const p of payouts) {
    if (p.status === 'paid') summary.paidNet += p.netAmount;
    else if (p.status === 'pending') summary.pendingNet += p.netAmount;
  }
  return summary;
}
