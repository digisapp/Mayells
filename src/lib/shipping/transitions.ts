/**
 * Shipment status machine, shared by the admin PATCH (validation) and the
 * invoicing unwind path (which shipments a refund can cancel).
 */

import type { shipmentStatusEnum } from '@/db/schema';

export type ShipmentStatus = (typeof shipmentStatusEnum.enumValues)[number];

export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  pending: ['needs_address', 'label_created', 'pickup_scheduled', 'picked_up', 'in_transit', 'cancelled'],
  needs_address: ['pending', 'label_created', 'pickup_scheduled', 'picked_up', 'in_transit', 'cancelled'],
  label_created: ['pickup_scheduled', 'picked_up', 'in_transit', 'cancelled'],
  pickup_scheduled: ['picked_up', 'in_transit', 'exception'],
  picked_up: ['in_transit', 'out_for_delivery', 'delivered', 'exception'],
  in_transit: ['out_for_delivery', 'delivered', 'exception'],
  out_for_delivery: ['delivered', 'exception'],
  exception: ['in_transit', 'returned'],
  // Terminal
  delivered: [],
  returned: [],
  cancelled: [],
};

export function canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return from === to || SHIPMENT_TRANSITIONS[from].includes(to);
}

/** Not yet handed to a carrier — an unwound sale can simply cancel these. */
export const OPEN_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  'pending',
  'needs_address',
  'label_created',
  'pickup_scheduled',
];

/** Already moving — an unwound sale needs a manual recall. */
export const IN_FLIGHT_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  'picked_up',
  'in_transit',
  'out_for_delivery',
];

/** Statuses that mean "the buyer's item is on its way" for notifications. */
export const SHIPPED_STATUSES: readonly ShipmentStatus[] = ['picked_up', 'in_transit'];

/** Header buckets — also the valid values for the admin ?status= filter. */
export const SHIPMENT_STATUS_BUCKETS = {
  pending: ['pending', 'label_created', 'pickup_scheduled'],
  needs_address: ['needs_address'],
  in_transit: ['picked_up', 'in_transit', 'out_for_delivery'],
  delivered: ['delivered'],
  exception: ['exception', 'returned'],
  cancelled: ['cancelled'],
} as const satisfies Record<string, readonly ShipmentStatus[]>;

export type ShipmentBucket = keyof typeof SHIPMENT_STATUS_BUCKETS;
