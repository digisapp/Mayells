import { pgTable, uuid, text, integer, timestamp, pgEnum, index, boolean, numeric } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';

export const consignmentStatusEnum = pgEnum('consignment_status', [
  'submitted',
  'under_review',
  'approved',
  'declined',
  'listed',
  'sold',
  'returned',
]);

export const consignments = pgTable('consignments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sellerId: uuid('seller_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  categorySlug: text('category_slug').notNull(),
  estimatedValue: integer('estimated_value'),
  status: consignmentStatusEnum('status').default('submitted').notNull(),
  lotId: uuid('lot_id'),
  commissionPercent: integer('commission_percent'),
  reviewNotes: text('review_notes'),
  reviewedById: uuid('reviewed_by_id').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  images: text('images').array().default([]),

  // Seller's pickup/ship-from address
  pickupStreet: text('pickup_street'),
  pickupStreet2: text('pickup_street_2'),
  pickupCity: text('pickup_city'),
  pickupState: text('pickup_state'),
  pickupZip: text('pickup_zip'),
  pickupCountry: text('pickup_country').default('US'),
  pickupPhone: text('pickup_phone'),

  // Shipping preferences
  sellerShipsItem: boolean('seller_ships_item').default(true).notNull(), // seller drops at FedEx/UPS
  requestPickup: boolean('request_pickup').default(false).notNull(),     // wants carrier pickup
  requiresWhiteGlove: boolean('requires_white_glove').default(false).notNull(),

  // Package estimates (seller provides)
  weightLbs: integer('weight_lbs'),
  lengthIn: integer('length_in'),
  widthIn: integer('width_in'),
  heightIn: integer('height_in'),
  isFragile: boolean('is_fragile').default(false).notNull(),

  // AI-generated data (populated on submission)
  aiTitle: text('ai_title'),
  aiDescription: text('ai_description'),
  aiCategory: text('ai_category'),
  aiEstimateLow: integer('ai_estimate_low'),
  aiEstimateHigh: integer('ai_estimate_high'),
  aiConfidence: numeric('ai_confidence'),
  aiCondition: text('ai_condition'),
  aiTags: text('ai_tags').array(),
  aiArtist: text('ai_artist'),
  aiPeriod: text('ai_period'),
  aiMedium: text('ai_medium'),
  aiOrigin: text('ai_origin'),
  aiProcessedAt: timestamp('ai_processed_at'),

  // Agreement
  agreementSignedAt: timestamp('agreement_signed_at'),
  agreementIp: text('agreement_ip'),

  // Auto-approval
  autoApproved: boolean('auto_approved').default(false).notNull(),

  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('consignments_seller_idx').on(table.sellerId),
  index('consignments_status_idx').on(table.status),
]);

export const consignmentsRelations = relations(consignments, ({ one }) => ({
  seller: one(users, {
    fields: [consignments.sellerId],
    references: [users.id],
    relationName: 'consignmentSeller',
  }),
  reviewer: one(users, {
    fields: [consignments.reviewedById],
    references: [users.id],
    relationName: 'consignmentReviewer',
  }),
}));

export type Consignment = typeof consignments.$inferSelect;
export type NewConsignment = typeof consignments.$inferInsert;
