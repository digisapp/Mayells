/**
 * One badge per money-side status, shared by Invoices, Payouts, Shipments and
 * the client page, so "refunded" or "paid" reads the same colour everywhere.
 * Colours follow the stat-tile dots on those pages: yellow waiting, green
 * done, red needs a human, grey closed, purple money going back out.
 */

export interface StatusBadge {
  label: string;
  className: string;
}

const YELLOW = 'bg-yellow-100 text-yellow-800';
const GREEN = 'bg-green-100 text-green-800';
const RED = 'bg-red-100 text-red-800';
const GRAY = 'bg-gray-100 text-gray-700';
const BLUE = 'bg-blue-100 text-blue-800';
const SKY = 'bg-sky-100 text-sky-800';
const INDIGO = 'bg-indigo-100 text-indigo-800';
const ORANGE = 'bg-orange-100 text-orange-800';
const PURPLE = 'bg-purple-100 text-purple-800';

export const INVOICE_STATUS: Record<string, StatusBadge> = {
  pending: { label: 'Pending', className: YELLOW },
  overdue: { label: 'Overdue', className: RED },
  paid: { label: 'Paid', className: GREEN },
  refunded: { label: 'Refunded', className: PURPLE },
  cancelled: { label: 'Cancelled', className: GRAY },
};

export const PAYOUT_STATUS: Record<string, StatusBadge> = {
  pending: { label: 'Pending', className: YELLOW },
  paid: { label: 'Paid', className: GREEN },
  reversed: { label: 'Reversed', className: RED },
  cancelled: { label: 'Cancelled', className: GRAY },
};

export const SHIPMENT_STATUS: Record<string, StatusBadge> = {
  pending: { label: 'Pending', className: YELLOW },
  needs_address: { label: 'Needs address', className: RED },
  label_created: { label: 'Label created', className: SKY },
  pickup_scheduled: { label: 'Pickup scheduled', className: SKY },
  picked_up: { label: 'Picked up', className: SKY },
  in_transit: { label: 'In transit', className: BLUE },
  out_for_delivery: { label: 'Out for delivery', className: INDIGO },
  delivered: { label: 'Delivered', className: GREEN },
  exception: { label: 'Exception', className: ORANGE },
  returned: { label: 'Returned', className: ORANGE },
  cancelled: { label: 'Cancelled', className: GRAY },
};

export const PAYMENT_STATUS: Record<string, StatusBadge> = {
  pending: { label: 'Pending', className: YELLOW },
  processing: { label: 'Processing', className: BLUE },
  succeeded: { label: 'Succeeded', className: GREEN },
  failed: { label: 'Failed', className: RED },
  refunded: { label: 'Refunded', className: PURPLE },
};

/** Look up a status, falling back to a neutral badge with the raw value humanized. */
export function statusBadge(map: Record<string, StatusBadge>, status: string): StatusBadge {
  return map[status] ?? { label: status.replace(/_/g, ' '), className: GRAY };
}
