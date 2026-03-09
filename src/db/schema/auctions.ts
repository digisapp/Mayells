import { pgTable, uuid, text, integer, timestamp, boolean, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';

export const auctionStatusEnum = pgEnum('auction_status', [
  'draft',
  'scheduled',
  'preview',
  'open',
  'live',
  'closing',
  'closed',
  'completed',
  'cancelled',
]);

export const auctionTypeEnum = pgEnum('auction_type', ['timed', 'live']);

export const auctions = pgTable('auctions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  description: text('description'),
  slug: text('slug').unique().notNull(),

  type: auctionTypeEnum('type').default('timed').notNull(),
  status: auctionStatusEnum('status').default('draft').notNull(),

  // Timing
  previewStartsAt: timestamp('preview_starts_at'),
  biddingStartsAt: timestamp('bidding_starts_at'),
  biddingEndsAt: timestamp('bidding_ends_at'),
  actualEndedAt: timestamp('actual_ended_at'),

  // Anti-snipe settings
  antiSnipeEnabled: boolean('anti_snipe_enabled').default(true).notNull(),
  antiSnipeMinutes: integer('anti_snipe_minutes').default(2).notNull(),
  antiSnipeWindowMinutes: integer('anti_snipe_window_minutes').default(5).notNull(),

  // Staggered close
  lotClosingIntervalSeconds: integer('lot_closing_interval_seconds').default(30),

  // Images
  coverImageUrl: text('cover_image_url'),
  bannerImageUrl: text('banner_image_url'),

  // Denormalized stats
  lotCount: integer('lot_count').default(0).notNull(),
  totalBids: integer('total_bids').default(0).notNull(),
  registeredBidders: integer('registered_bidders').default(0).notNull(),

  // Buyer's premium
  buyerPremiumPercent: integer('buyer_premium_percent').default(25).notNull(),

  // LiveKit (Phase 3)
  livekitRoomName: text('livekit_room_name').unique(),

  // External
  liveauctioneersUrl: text('liveauctioneers_url'),

  // Admin
  createdById: uuid('created_by_id').references(() => users.id),
  auctioneerId: uuid('auctioneer_id').references(() => users.id),

  // Metadata
  isFeatured: boolean('is_featured').default(false).notNull(),
  saleNumber: text('sale_number'),

  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('auctions_status_idx').on(table.status),
  index('auctions_slug_idx').on(table.slug),
  index('auctions_bidding_starts_idx').on(table.biddingStartsAt),
  index('auctions_featured_idx').on(table.isFeatured, table.status),
]);

export const auctionsRelations = relations(auctions, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [auctions.createdById],
    references: [users.id],
    relationName: 'auctionCreator',
  }),
  auctioneer: one(users, {
    fields: [auctions.auctioneerId],
    references: [users.id],
    relationName: 'auctionAuctioneer',
  }),
  auctionLots: many(auctionLots),
}));

// Junction table
import { lots } from './lots';

export const auctionLots = pgTable('auction_lots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  auctionId: uuid('auction_id').references(() => auctions.id, { onDelete: 'cascade' }).notNull(),
  lotId: uuid('lot_id').references(() => lots.id, { onDelete: 'cascade' }).notNull(),
  lotNumber: integer('lot_number').notNull(),
  closingAt: timestamp('closing_at'),
  createdAt: timestamp('created_at').default(sql`now()`),
}, (table) => [
  index('auction_lots_auction_idx').on(table.auctionId, table.lotNumber),
  index('auction_lots_lot_idx').on(table.lotId),
]);

export const auctionLotsRelations = relations(auctionLots, ({ one }) => ({
  auction: one(auctions, {
    fields: [auctionLots.auctionId],
    references: [auctions.id],
  }),
  lot: one(lots, {
    fields: [auctionLots.lotId],
    references: [lots.id],
  }),
}));

export type Auction = typeof auctions.$inferSelect;
export type NewAuction = typeof auctions.$inferInsert;
export type AuctionLot = typeof auctionLots.$inferSelect;
