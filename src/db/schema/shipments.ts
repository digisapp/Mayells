import { pgTable, uuid, text, integer, timestamp, pgEnum, index, boolean } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { invoices } from './invoices';
import { lots } from './lots';

export const shippingMethodEnum = pgEnum('shipping_method', [
  'standard',        // Seller drops off at FedEx/UPS
  'pickup',          // Carrier picks up from seller's address
  'white_glove',     // Professional art/antique shipper
]);

export const shipmentStatusEnum = pgEnum('shipment_status', [
  'pending',         // Awaiting payment / invoice not yet paid
  'label_created',   // Label generated, waiting for seller to ship
  'pickup_scheduled',// Carrier pickup scheduled at seller's address
  'picked_up',       // Carrier picked up from seller
  'in_transit',      // On the way to buyer
  'out_for_delivery',// Last mile
  'delivered',       // Confirmed delivered
  'exception',       // Problem (damaged, lost, returned to sender)
  'returned',        // Returned to seller
]);

export const carrierEnum = pgEnum('shipping_carrier', [
  'fedex',
  'ups',
  'usps',
  'dhl',
  'arta',            // White glove art shipping
  'other',
]);

export const shipments = pgTable('shipments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid('invoice_id').references(() => invoices.id).notNull(),
  lotId: uuid('lot_id').references(() => lots.id).notNull(),
  sellerId: uuid('seller_id').references(() => users.id).notNull(),
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),

  // Shipping method & carrier
  method: shippingMethodEnum('method').default('standard').notNull(),
  carrier: carrierEnum('carrier'),

  // Status
  status: shipmentStatusEnum('status').default('pending').notNull(),

  // Label & tracking
  labelUrl: text('label_url'),
  trackingNumber: text('tracking_number'),
  trackingUrl: text('tracking_url'),

  // Shippo / provider IDs
  externalShipmentId: text('external_shipment_id'),
  externalTransactionId: text('external_transaction_id'),
  externalRateId: text('external_rate_id'),

  // Costs (in cents)
  shippingCost: integer('shipping_cost').default(0).notNull(),
  insuranceCost: integer('insurance_cost').default(0).notNull(),
  insuranceValue: integer('insurance_value').default(0), // declared value for insurance

  // Pickup details
  pickupDate: timestamp('pickup_date'),
  pickupWindowStart: text('pickup_window_start'), // e.g. "9:00 AM"
  pickupWindowEnd: text('pickup_window_end'),     // e.g. "5:00 PM"

  // Origin (seller's address)
  fromName: text('from_name').notNull(),
  fromPhone: text('from_phone'),
  fromEmail: text('from_email'),
  fromStreet: text('from_street').notNull(),
  fromStreet2: text('from_street_2'),
  fromCity: text('from_city').notNull(),
  fromState: text('from_state').notNull(),
  fromZip: text('from_zip').notNull(),
  fromCountry: text('from_country').default('US').notNull(),

  // Destination (buyer's address)
  toName: text('to_name').notNull(),
  toPhone: text('to_phone'),
  toEmail: text('to_email'),
  toStreet: text('to_street').notNull(),
  toStreet2: text('to_street_2'),
  toCity: text('to_city').notNull(),
  toState: text('to_state').notNull(),
  toZip: text('to_zip').notNull(),
  toCountry: text('to_country').default('US').notNull(),

  // Package dimensions
  weightLbs: integer('weight_lbs'),
  weightOz: integer('weight_oz'),
  lengthIn: integer('length_in'),
  widthIn: integer('width_in'),
  heightIn: integer('height_in'),

  // Flags
  requiresSignature: boolean('requires_signature').default(true).notNull(),
  requiresInsurance: boolean('requires_insurance').default(true).notNull(),
  isFragile: boolean('is_fragile').default(false).notNull(),

  // Timestamps
  labelCreatedAt: timestamp('label_created_at'),
  shippedAt: timestamp('shipped_at'),
  deliveredAt: timestamp('delivered_at'),
  estimatedDelivery: timestamp('estimated_delivery'),

  // Notes
  sellerNotes: text('seller_notes'),
  buyerNotes: text('buyer_notes'),
  internalNotes: text('internal_notes'),

  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('shipments_invoice_idx').on(table.invoiceId),
  index('shipments_lot_idx').on(table.lotId),
  index('shipments_seller_idx').on(table.sellerId),
  index('shipments_buyer_idx').on(table.buyerId),
  index('shipments_status_idx').on(table.status),
  index('shipments_tracking_idx').on(table.trackingNumber),
]);

export const shipmentsRelations = relations(shipments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [shipments.invoiceId],
    references: [invoices.id],
  }),
  lot: one(lots, {
    fields: [shipments.lotId],
    references: [lots.id],
  }),
  seller: one(users, {
    fields: [shipments.sellerId],
    references: [users.id],
    relationName: 'shipmentSeller',
  }),
  buyer: one(users, {
    fields: [shipments.buyerId],
    references: [users.id],
    relationName: 'shipmentBuyer',
  }),
}));

export type Shipment = typeof shipments.$inferSelect;
export type NewShipment = typeof shipments.$inferInsert;
