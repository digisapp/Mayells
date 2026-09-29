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
