import { pgTable, uuid, text, integer, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { lots } from './lots';

export const lotImages = pgTable('lot_images', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  lotId: uuid('lot_id').references(() => lots.id, { onDelete: 'cascade' }).notNull(),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  altText: text('alt_text'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isPrimary: boolean('is_primary').default(false).notNull(),
  width: integer('width'),
  height: integer('height'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  createdAt: timestamp('created_at').default(sql`now()`),
}, (table) => [
  index('lot_images_lot_idx').on(table.lotId, table.sortOrder),
]);

export const lotImagesRelations = relations(lotImages, ({ one }) => ({
  lot: one(lots, {
    fields: [lotImages.lotId],
    references: [lots.id],
  }),
}));

export type LotImage = typeof lotImages.$inferSelect;
export type NewLotImage = typeof lotImages.$inferInsert;
