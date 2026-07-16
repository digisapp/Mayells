import { pgTable, uuid, text, integer, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { lots } from './lots';
import { invoices } from './invoices';

export const payoutStatusEnum = pgEnum('payout_status', ['pending', 'paid', 'cancelled']);

// How the seller was actually paid. Manual methods for now; 'stripe' reserved
// for a future Stripe Connect transfer flow (users.stripe_connect_account_id
// already exists for it).
export const payoutMethodEnum = pgEnum('payout_method', ['wire', 'check', 'stripe', 'other']);

/**
 * Seller settlement ledger — one row per sold lot, created when the buyer's
 * invoice is paid. This is the record of what we owe the consignor; actually
 * moving the money is (for now) a manual wire/check recorded via mark-paid.
 */
export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid('invoice_id').references(() => invoices.id).notNull(),
  lotId: uuid('lot_id').references(() => lots.id).notNull(),
  sellerId: uuid('seller_id').references(() => users.id).notNull(),

  // Money (all in cents). netAmount = hammerPrice - commissionAmount.
  hammerPrice: integer('hammer_price').notNull(),
  commissionPercent: integer('commission_percent').notNull(),
  commissionAmount: integer('commission_amount').notNull(),
  netAmount: integer('net_amount').notNull(),

  status: payoutStatusEnum('status').default('pending').notNull(),

  // Payment record (set by admin mark-paid)
  method: payoutMethodEnum('method'),
  reference: text('reference'),
  notes: text('notes'),
  paidAt: timestamp('paid_at'),
  paidById: uuid('paid_by_id').references(() => users.id),

  statementSentAt: timestamp('statement_sent_at'),

  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('payouts_seller_idx').on(table.sellerId),
  index('payouts_status_idx').on(table.status),
  index('payouts_invoice_idx').on(table.invoiceId),
  // At most one live payout per lot — a webhook redelivery or admin replay
  // must never owe the seller twice
  uniqueIndex('payouts_lot_unique_idx').on(table.lotId).where(sql`status <> 'cancelled'`),
]);

export const payoutsRelations = relations(payouts, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payouts.invoiceId],
    references: [invoices.id],
  }),
  lot: one(lots, {
    fields: [payouts.lotId],
    references: [lots.id],
  }),
  seller: one(users, {
    fields: [payouts.sellerId],
    references: [users.id],
    relationName: 'payoutSeller',
  }),
  paidBy: one(users, {
    fields: [payouts.paidById],
    references: [users.id],
    relationName: 'payoutPaidBy',
  }),
}));

export type Payout = typeof payouts.$inferSelect;
export type NewPayout = typeof payouts.$inferInsert;
