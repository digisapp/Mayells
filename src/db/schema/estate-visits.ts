import { pgTable, uuid, text, integer, timestamp, pgEnum, index, numeric } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const estateVisitStatusEnum = pgEnum('estate_visit_status', [
  'draft',
  'uploading',
  'processing',
  'review',
  'sent',
  'archived',
]);

export const estateItemStatusEnum = pgEnum('estate_item_status', [
  'pending',
  'processing',
  'completed',
  'error',
]);

export const estateVisits = pgTable('estate_visits', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clientName: text('client_name').notNull(),
  clientEmail: text('client_email'),
  clientPhone: text('client_phone'),
  clientAddress: text('client_address'),
  clientCity: text('client_city'),
  clientState: text('client_state'),
  visitDate: timestamp('visit_date'),
  notes: text('notes'),
  status: estateVisitStatusEnum('status').default('draft').notNull(),
  reportToken: text('report_token').unique().notNull(),
  itemCount: integer('item_count').default(0).notNull(),
  processedCount: integer('processed_count').default(0).notNull(),
  totalEstimateLow: integer('total_estimate_low').default(0).notNull(),
  totalEstimateHigh: integer('total_estimate_high').default(0).notNull(),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('estate_visits_status_idx').on(table.status),
  index('estate_visits_token_idx').on(table.reportToken),
  index('estate_visits_created_idx').on(table.createdAt),
]);

export const estateVisitItems = pgTable('estate_visit_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  visitId: uuid('visit_id').references(() => estateVisits.id, { onDelete: 'cascade' }).notNull(),
  imageUrl: text('image_url').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  status: estateItemStatusEnum('status').default('pending').notNull(),
  errorMessage: text('error_message'),
  title: text('title'),
  description: text('description'),
  artist: text('artist'),
  period: text('period'),
  medium: text('medium'),
  dimensions: text('dimensions'),
  condition: text('condition'),
  conditionNotes: text('condition_notes'),
  suggestedCategory: text('suggested_category'),
  estimateLow: integer('estimate_low'),
  estimateHigh: integer('estimate_high'),
  confidence: numeric('confidence'),
  reasoning: text('reasoning'),
  marketTrend: text('market_trend'),
  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('estate_items_visit_idx').on(table.visitId, table.sortOrder),
  index('estate_items_status_idx').on(table.status),
]);

export const estateVisitsRelations = relations(estateVisits, ({ many }) => ({
  items: many(estateVisitItems),
}));

export const estateVisitItemsRelations = relations(estateVisitItems, ({ one }) => ({
  visit: one(estateVisits, {
    fields: [estateVisitItems.visitId],
    references: [estateVisits.id],
  }),
}));

export type EstateVisit = typeof estateVisits.$inferSelect;
export type NewEstateVisit = typeof estateVisits.$inferInsert;
export type EstateVisitItem = typeof estateVisitItems.$inferSelect;
export type NewEstateVisitItem = typeof estateVisitItems.$inferInsert;
