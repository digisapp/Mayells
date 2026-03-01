import { pgTable, uuid, text, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
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
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),
  auctionId: uuid('auction_id').references(() => auctions.id).notNull(),
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
  index('invoices_lot_idx').on(table.lotId),
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
