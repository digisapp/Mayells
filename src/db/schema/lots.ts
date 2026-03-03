import { pgTable, uuid, text, integer, timestamp, boolean, pgEnum, index, numeric } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { categories, subcategories } from './categories';

export const lotStatusEnum = pgEnum('lot_status', [
  'draft',
  'pending_review',
  'approved',
  'for_sale',
  'in_auction',
  'sold',
  'unsold',
  'withdrawn',
]);

export const saleTypeEnum = pgEnum('sale_type', ['auction', 'gallery', 'private']);

export const conditionEnum = pgEnum('lot_condition', [
  'mint',
  'excellent',
  'very_good',
  'good',
  'fair',
  'poor',
  'as_is',
]);

export const lots = pgTable('lots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  lotNumber: integer('lot_number'),

  // Core info
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  description: text('description').notNull(),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
  subcategoryId: uuid('subcategory_id').references(() => subcategories.id),

  // Attribution
  artist: text('artist'),
  maker: text('maker'),
  period: text('period'),
  circa: text('circa'),
  origin: text('origin'),
  medium: text('medium'),
  dimensions: text('dimensions'),
  weight: text('weight'),

  // Condition & provenance
  condition: conditionEnum('condition'),
  conditionNotes: text('condition_notes'),
  provenance: text('provenance'),
  literature: text('literature'),
  exhibited: text('exhibited'),

  // Status & sale type
  status: lotStatusEnum('status').default('draft').notNull(),
  saleType: saleTypeEnum('sale_type').default('auction').notNull(),

  // Estimates & pricing (all in cents)
  buyNowPrice: integer('buy_now_price'),
  estimateLow: integer('estimate_low'),
  estimateHigh: integer('estimate_high'),
  reservePrice: integer('reserve_price'),
  startingBid: integer('starting_bid'),

  // Ownership
  sellerId: uuid('seller_id').references(() => users.id),
  consignmentId: uuid('consignment_id'),

  // Denormalized bid state
  currentBidAmount: integer('current_bid_amount').default(0).notNull(),
  currentBidderId: uuid('current_bidder_id').references(() => users.id),
  bidCount: integer('bid_count').default(0).notNull(),

  // Winner
  winnerId: uuid('winner_id').references(() => users.id),
  hammerPrice: integer('hammer_price'),

  // Images
  primaryImageUrl: text('primary_image_url'),
  imageCount: integer('image_count').default(0).notNull(),

  // Flags
  isFeatured: boolean('is_featured').default(false).notNull(),
  isHighlight: boolean('is_highlight').default(false).notNull(),

  // AI metadata (Phase 2)
  aiDescription: text('ai_description'),
  aiTags: text('ai_tags').array(),
  aiEstimateLow: integer('ai_estimate_low'),
  aiEstimateHigh: integer('ai_estimate_high'),
  aiConfidenceScore: numeric('ai_confidence_score'),

  // SEO
  slug: text('slug').unique(),

  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('lots_category_idx').on(table.categoryId),
  index('lots_status_idx').on(table.status),
  index('lots_seller_idx').on(table.sellerId),
  index('lots_featured_idx').on(table.isFeatured, table.status),
  index('lots_slug_idx').on(table.slug),
  index('lots_current_bid_idx').on(table.currentBidAmount),
  index('lots_sale_type_idx').on(table.saleType, table.status),
]);

export const lotsRelations = relations(lots, ({ one, many }) => ({
  category: one(categories, {
    fields: [lots.categoryId],
    references: [categories.id],
  }),
  subcategory: one(subcategories, {
    fields: [lots.subcategoryId],
    references: [subcategories.id],
  }),
  seller: one(users, {
    fields: [lots.sellerId],
    references: [users.id],
    relationName: 'lotSeller',
  }),
  currentBidder: one(users, {
    fields: [lots.currentBidderId],
    references: [users.id],
    relationName: 'lotCurrentBidder',
  }),
  winner: one(users, {
    fields: [lots.winnerId],
    references: [users.id],
    relationName: 'lotWinner',
  }),
  images: many(lotImages),
}));

// Forward declaration - will be imported from lot-images.ts
import { lotImages } from './lot-images';

export type Lot = typeof lots.$inferSelect;
export type NewLot = typeof lots.$inferInsert;
