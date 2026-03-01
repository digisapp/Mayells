import { pgTable, uuid, integer, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const bidIncrements = pgTable('bid_increments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  fromAmount: integer('from_amount').notNull(),
  toAmount: integer('to_amount').notNull(),
  increment: integer('increment').notNull(),
  createdAt: timestamp('created_at').default(sql`now()`),
});

export type BidIncrement = typeof bidIncrements.$inferSelect;
