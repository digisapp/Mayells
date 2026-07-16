import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { categories } from './categories';

export const savedSearches = pgTable('saved_searches', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  query: text('query').notNull(),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
  // Alert watermark: the cron only mails lots created after this, so each new
  // match is announced at most once. Initialized to creation time — saving a
  // search never emails about inventory that already existed.
  lastNotifiedAt: timestamp('last_notified_at').default(sql`now()`).notNull(),
  createdAt: timestamp('created_at').default(sql`now()`),
}, (table) => [
  index('saved_searches_user_idx').on(table.userId),
]);

export const savedSearchesRelations = relations(savedSearches, ({ one }) => ({
  user: one(users, {
    fields: [savedSearches.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [savedSearches.categoryId],
    references: [categories.id],
  }),
}));

export type SavedSearch = typeof savedSearches.$inferSelect;
export type NewSavedSearch = typeof savedSearches.$inferInsert;
