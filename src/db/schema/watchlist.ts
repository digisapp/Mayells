import { pgTable, uuid, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { lots } from './lots';

export const watchlist = pgTable('watchlist', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  lotId: uuid('lot_id').references(() => lots.id, { onDelete: 'cascade' }).notNull(),
  // Set when the "closing soon" alert has been emailed for this watch, so the
  // lifecycle cron notifies each watcher at most once as a lot nears its close.
  endingSoonNotifiedAt: timestamp('ending_soon_notified_at'),
  createdAt: timestamp('created_at').default(sql`now()`),
}, (table) => [
  index('watchlist_user_idx').on(table.userId),
  index('watchlist_lot_idx').on(table.lotId),
  uniqueIndex('watchlist_unique_idx').on(table.userId, table.lotId),
]);

export const watchlistRelations = relations(watchlist, ({ one }) => ({
  user: one(users, {
    fields: [watchlist.userId],
    references: [users.id],
  }),
  lot: one(lots, {
    fields: [watchlist.lotId],
    references: [lots.id],
  }),
}));

export type WatchlistEntry = typeof watchlist.$inferSelect;
