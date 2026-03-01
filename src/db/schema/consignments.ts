import { pgTable, uuid, text, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
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
