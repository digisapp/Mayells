/** Buyer-facing invoice status label and badge colour, shared by every page that shows one. */
export const INVOICE_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-green-600 text-white' },
  pending: { label: 'Payment Due', className: 'bg-amber-500 text-white' },
  overdue: { label: 'Overdue', className: 'bg-red-600 text-white' },
  refunded: { label: 'Refunded', className: 'bg-zinc-500 text-white' },
  cancelled: { label: 'Cancelled', className: 'bg-zinc-500 text-white' },
};

export function invoiceStatusBadge(status: string): { label: string; className: string } {
  return (
    INVOICE_STATUS_BADGE[status] ?? {
      label: status.charAt(0).toUpperCase() + status.slice(1),
      className: 'bg-zinc-500 text-white',
    }
  );
}

/**
 * The badge for a buyer's invoice, aware of Buy Now orders: while the
 * checkout hold is live it reads "Reserved", and a checkout that ended unpaid
 * (cancelled, or lapsed and not yet swept) reads "Not completed" — it was
 * never a bill the buyer owed.
 */
export function buyerInvoiceBadge(
  invoice: { status: string; holdExpiresAt: Date | null },
  now: Date = new Date(),
): { label: string; className: string } {
  if (invoice.holdExpiresAt && (invoice.status === 'pending' || invoice.status === 'overdue' || invoice.status === 'cancelled')) {
    const live = invoice.status !== 'cancelled' && invoice.holdExpiresAt.getTime() > now.getTime();
    return live
      ? { label: 'Reserved', className: 'bg-amber-500 text-white' }
      : { label: 'Not completed', className: 'bg-zinc-500 text-white' };
  }
  return invoiceStatusBadge(invoice.status);
}
