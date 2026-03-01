import { pgTable, uuid, text, integer, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  lotCount: integer('lot_count').default(0).notNull(),
  createdAt: timestamp('created_at').default(sql`now()`),
}, (table) => [
  index('categories_slug_idx').on(table.slug),
  index('categories_sort_order_idx').on(table.sortOrder),
]);

export const subcategories = pgTable('subcategories', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').default(sql`now()`),
}, (table) => [
  index('subcategories_category_idx').on(table.categoryId),
]);

export const categoriesRelations = relations(categories, ({ many }) => ({
  subcategories: many(subcategories),
}));

export const subcategoriesRelations = relations(subcategories, ({ one }) => ({
  category: one(categories, {
    fields: [subcategories.categoryId],
    references: [categories.id],
  }),
}));

export type Category = typeof categories.$inferSelect;
export type Subcategory = typeof subcategories.$inferSelect;
