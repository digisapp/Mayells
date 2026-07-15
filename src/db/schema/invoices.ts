import { pgTable, uuid, text, integer, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { lots } from './lots';
import { auctions } from './auctions';

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'pending',
  'paid',
  'overdue',
  'cancelled',
  'refunded',
]);

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text('invoice_number').unique().notNull(),
  // Unguessable token for buyer-facing invoice access without an on-site
  // account (matches the upload-link pattern). Sent in the invoice email.
  accessToken: uuid('access_token').default(sql`gen_random_uuid()`).notNull().unique(),
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),
  auctionId: uuid('auction_id').references(() => auctions.id),
  lotId: uuid('lot_id').references(() => lots.id).notNull(),

  // Pricing (all in cents)
  hammerPrice: integer('hammer_price').notNull(),
  buyerPremium: integer('buyer_premium').notNull(),
  shippingCost: integer('shipping_cost').default(0),
  insuranceCost: integer('insurance_cost').default(0),
  taxAmount: integer('tax_amount').default(0),
  totalAmount: integer('total_amount').notNull(),

  status: invoiceStatusEnum('status').default('pending').notNull(),
  dueDate: timestamp('due_date').notNull(),
  paidAt: timestamp('paid_at'),

  // Stripe
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeChargeId: text('stripe_charge_id'),
  // The most recent Checkout session created for this invoice. Reused while it
  // is still open so a double-click / second tab can't spawn a second
  // PaymentIntent and double-charge the buyer.
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),

  // Shipping
  shippingAddress: text('shipping_address'),
  trackingNumber: text('tracking_number'),

  notes: text('notes'),

  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('invoices_buyer_idx').on(table.buyerId),
  index('invoices_status_idx').on(table.status),
  index('invoices_auction_idx').on(table.auctionId),
  // At most one live invoice per lot — settlement reruns must not double-invoice
  uniqueIndex('invoices_lot_unique_idx').on(table.lotId).where(sql`status <> 'cancelled'`),
  index('invoices_due_date_idx').on(table.dueDate),
]);

export const invoicesRelations = relations(invoices, ({ one }) => ({
  buyer: one(users, {
    fields: [invoices.buyerId],
    references: [users.id],
  }),
  auction: one(auctions, {
    fields: [invoices.auctionId],
    references: [auctions.id],
  }),
  lot: one(lots, {
    fields: [invoices.lotId],
    references: [lots.id],
  }),
}));

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
