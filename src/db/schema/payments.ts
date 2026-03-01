import { pgTable, uuid, text, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { invoices } from './invoices';

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending', 'processing', 'succeeded', 'failed', 'refunded',
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'credit_card', 'bank_transfer', 'wire',
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid('invoice_id').references(() => invoices.id).notNull(),
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),
  amount: integer('amount').notNull(),
  method: paymentMethodEnum('method').notNull(),
  status: paymentStatusEnum('status').default('pending').notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeChargeId: text('stripe_charge_id'),
  failureReason: text('failure_reason'),
  idempotencyKey: text('idempotency_key').unique(),
  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('payments_invoice_idx').on(table.invoiceId),
  index('payments_buyer_idx').on(table.buyerId),
  index('payments_status_idx').on(table.status),
]);

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
  buyer: one(users, {
    fields: [payments.buyerId],
    references: [users.id],
  }),
}));

export type Payment = typeof payments.$inferSelect;
