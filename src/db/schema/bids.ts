import { pgTable, uuid, integer, timestamp, boolean, pgEnum, text, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { lots } from './lots';
import { auctions } from './auctions';

export const bidTypeEnum = pgEnum('bid_type', ['manual', 'auto', 'phone', 'auctioneer']);

export const bidStatusEnum = pgEnum('bid_status', ['active', 'outbid', 'winning', 'won', 'retracted']);

export const bids = pgTable('bids', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // Bids are financial/legal records — establishing who owes what and feeding
  // settlement. Deleting a user or lot must NOT silently erase them: use
  // 'restrict' so a user/lot with bid history can't be hard-deleted (soft-delete
  // / anonymize instead).
  auctionId: uuid('auction_id').references(() => auctions.id, { onDelete: 'restrict' }).notNull(),
  lotId: uuid('lot_id').references(() => lots.id, { onDelete: 'restrict' }).notNull(),
  bidderId: uuid('bidder_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),

  amount: integer('amount').notNull(),
  maxBidAmount: integer('max_bid_amount'),
  bidType: bidTypeEnum('bid_type').default('manual').notNull(),
  status: bidStatusEnum('bid_status').default('active').notNull(),

  triggeredExtension: boolean('triggered_extension').default(false),

  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  idempotencyKey: text('idempotency_key').unique(),

  createdAt: timestamp('created_at').default(sql`now()`),
}, (table) => [
  index('bids_lot_idx').on(table.lotId, table.amount),
  index('bids_bidder_idx').on(table.bidderId, table.createdAt),
  index('bids_auction_idx').on(table.auctionId),
  index('bids_status_idx').on(table.status),
  index('bids_lot_status_idx').on(table.lotId, table.status),
]);

export const bidsRelations = relations(bids, ({ one }) => ({
  auction: one(auctions, {
    fields: [bids.auctionId],
    references: [auctions.id],
  }),
  lot: one(lots, {
    fields: [bids.lotId],
    references: [lots.id],
  }),
  bidder: one(users, {
    fields: [bids.bidderId],
    references: [users.id],
  }),
}));

// Max bids for proxy/automatic bidding
export const maxBids = pgTable('max_bids', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  lotId: uuid('lot_id').references(() => lots.id, { onDelete: 'cascade' }).notNull(),
  bidderId: uuid('bidder_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  maxAmount: integer('max_amount').notNull(),
  currentProxyBid: integer('current_proxy_bid'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  // One proxy max bid per bidder per lot — proxy execution assumes this
  uniqueIndex('max_bids_lot_bidder_unique_idx').on(table.lotId, table.bidderId),
  index('max_bids_active_idx').on(table.lotId, table.isActive),
]);

export const maxBidsRelations = relations(maxBids, ({ one }) => ({
  lot: one(lots, {
    fields: [maxBids.lotId],
    references: [lots.id],
  }),
  bidder: one(users, {
    fields: [maxBids.bidderId],
    references: [users.id],
  }),
}));

export type Bid = typeof bids.$inferSelect;
export type NewBid = typeof bids.$inferInsert;
export type MaxBid = typeof maxBids.$inferSelect;
