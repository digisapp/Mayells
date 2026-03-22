import { pgTable, uuid, text, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const prospectStatusEnum = pgEnum('prospect_status', [
  'new',
  'contacted',
  'upload_sent',
  'items_received',
  'under_review',
  'agreement_sent',
  'agreement_signed',
  'accepted',
  'declined',
  'archived',
]);

export const prospectSourceEnum = pgEnum('prospect_source', [
  'phone',
  'email',
  'website',
  'referral',
  'estate_visit',
  'walk_in',
  'other',
]);

export const sellerProspects = pgTable('seller_prospects', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

  // Contact info (no account needed)
  fullName: text('full_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  company: text('company'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zip: text('zip'),
  country: text('country').default('US'),

  // How they reached out
  source: prospectSourceEnum('source').default('email').notNull(),
  sourceNotes: text('source_notes'),

  // Status tracking
  status: prospectStatusEnum('status').default('new').notNull(),

  // Item overview (before upload)
  estimatedItemCount: integer('estimated_item_count'),
  itemSummary: text('item_summary'),
  notes: text('notes'),

  // Aggregate stats (updated as items are processed)
  totalItems: integer('total_items').default(0).notNull(),
  reviewedItems: integer('reviewed_items').default(0).notNull(),
  acceptedItems: integer('accepted_items').default(0).notNull(),
  totalEstimateLow: integer('total_estimate_low').default(0).notNull(),
  totalEstimateHigh: integer('total_estimate_high').default(0).notNull(),

  // Commission
  agreedCommissionPercent: integer('agreed_commission_percent'),

  // Agreement
  agreementSentAt: timestamp('agreement_sent_at'),
  agreementSignedAt: timestamp('agreement_signed_at'),
  agreementIp: text('agreement_ip'),

  // If they become a registered user later
  userId: uuid('user_id'),

  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('seller_prospects_status_idx').on(table.status),
  index('seller_prospects_email_idx').on(table.email),
  index('seller_prospects_created_idx').on(table.createdAt),
]);

export const sellerProspectsRelations = relations(sellerProspects, ({ many }) => ({
  uploadLinks: many(uploadLinks),
}));

// ── Upload Links (tokenized, no auth required) ──

export const uploadLinkStatusEnum = pgEnum('upload_link_status', [
  'active',
  'expired',
  'completed',
]);

export const uploadLinks = pgTable('upload_links', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  prospectId: uuid('prospect_id').references(() => sellerProspects.id, { onDelete: 'cascade' }).notNull(),
  token: text('token').unique().notNull(),
  status: uploadLinkStatusEnum('upload_link_status').default('active').notNull(),

  // Optional limits
  maxItems: integer('max_items'),
  expiresAt: timestamp('expires_at'),

  // Usage stats
  itemCount: integer('item_count').default(0).notNull(),
  lastUploadAt: timestamp('last_upload_at'),

  createdAt: timestamp('created_at').default(sql`now()`),
}, (table) => [
  index('upload_links_token_idx').on(table.token),
  index('upload_links_prospect_idx').on(table.prospectId),
]);

export const uploadLinksRelations = relations(uploadLinks, ({ one, many }) => ({
  prospect: one(sellerProspects, {
    fields: [uploadLinks.prospectId],
    references: [sellerProspects.id],
  }),
  items: many(uploadItems),
}));

// ── Upload Items (individual items within a batch) ──

export const uploadItemStatusEnum = pgEnum('upload_item_status', [
  'uploaded',
  'processing',
  'cataloged',
  'accepted',
  'declined',
  'lot_created',
]);

export const uploadItems = pgTable('upload_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  uploadLinkId: uuid('upload_link_id').references(() => uploadLinks.id, { onDelete: 'cascade' }).notNull(),
  prospectId: uuid('prospect_id').references(() => sellerProspects.id, { onDelete: 'cascade' }).notNull(),

  // Seller-provided
  images: text('images').array().default([]),
  sellerNotes: text('seller_notes'),
  sellerTitle: text('seller_title'),

  // Sort / grouping
  sortOrder: integer('sort_order').default(0).notNull(),
  groupLabel: text('group_label'),

  // AI-generated catalog data
  aiTitle: text('ai_title'),
  aiSubtitle: text('ai_subtitle'),
  aiDescription: text('ai_description'),
  aiArtist: text('ai_artist'),
  aiMaker: text('ai_maker'),
  aiPeriod: text('ai_period'),
  aiCirca: text('ai_circa'),
  aiOrigin: text('ai_origin'),
  aiMedium: text('ai_medium'),
  aiDimensions: text('ai_dimensions'),
  aiCondition: text('ai_condition'),
  aiConditionNotes: text('ai_condition_notes'),
  aiCategory: text('ai_category'),
  aiTags: text('ai_tags').array(),

  // AI appraisal
  aiEstimateLow: integer('ai_estimate_low'),
  aiEstimateHigh: integer('ai_estimate_high'),
  aiConfidence: text('ai_confidence'),
  aiReasoning: text('ai_reasoning'),
  aiMarketTrend: text('ai_market_trend'),
  aiRecommendedReserve: integer('ai_recommended_reserve'),
  aiSuggestedStartingBid: integer('ai_suggested_starting_bid'),
  aiProcessedAt: timestamp('ai_processed_at'),

  // Admin review
  status: uploadItemStatusEnum('upload_item_status').default('uploaded').notNull(),
  adminNotes: text('admin_notes'),
  reviewedAt: timestamp('reviewed_at'),

  // Override fields (admin can adjust AI suggestions)
  finalTitle: text('final_title'),
  finalDescription: text('final_description'),
  finalEstimateLow: integer('final_estimate_low'),
  finalEstimateHigh: integer('final_estimate_high'),
  finalReserve: integer('final_reserve'),
  finalCategory: text('final_category'),

  // Link to created lot (after acceptance + lot creation)
  lotId: uuid('lot_id'),

  // Link to auction (after placement)
  auctionId: uuid('auction_id'),

  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('upload_items_link_idx').on(table.uploadLinkId),
  index('upload_items_prospect_idx').on(table.prospectId),
  index('upload_items_status_idx').on(table.status),
]);

export const uploadItemsRelations = relations(uploadItems, ({ one }) => ({
  uploadLink: one(uploadLinks, {
    fields: [uploadItems.uploadLinkId],
    references: [uploadLinks.id],
  }),
  prospect: one(sellerProspects, {
    fields: [uploadItems.prospectId],
    references: [sellerProspects.id],
  }),
}));

export type SellerProspect = typeof sellerProspects.$inferSelect;
export type NewSellerProspect = typeof sellerProspects.$inferInsert;
export type UploadLink = typeof uploadLinks.$inferSelect;
export type NewUploadLink = typeof uploadLinks.$inferInsert;
export type UploadItem = typeof uploadItems.$inferSelect;
export type NewUploadItem = typeof uploadItems.$inferInsert;
