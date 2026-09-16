import { pgTable, uuid, text, integer, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { lots } from './lots';
import { invoices } from './invoices';

// 'reversed': the payout was already paid out when the buyer's invoice was
// refunded — the money must be clawed back from the consignor manually.
export const payoutStatusEnum = pgEnum('payout_status', ['pending', 'paid', 'cancelled', 'reversed']);

// Which agreement the commission rate came from (see lib/payouts/commission.ts).
export type PayoutCommissionSource = 'consignment' | 'prospect' | 'default';

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
  // Where the rate came from: consignment agreement / prospect agreement /
  // house default. Null on rows created before this column existed.
  commissionSource: text('commission_source').$type<PayoutCommissionSource>(),

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
  // must never owe the seller twice. Cancelled and reversed payouts are dead
  // so a re-sale of the lot can be settled again.
  // Written as a positive list on purpose: 'reversed' is added to the enum in
  // the same migration, and Postgres refuses to reference a new enum value
  // inside the transaction that adds it (drizzle-kit runs every pending
  // migration in one transaction). A text cast is no escape either — enum I/O
  // functions are not IMMUTABLE, so they can't appear in an index predicate.
  uniqueIndex('payouts_lot_unique_idx').on(table.lotId).where(sql`status in ('pending', 'paid')`),
]).enableRLS();

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
