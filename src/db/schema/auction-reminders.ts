import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { lots } from './lots';

export const auctionReminders = pgTable('auction_reminders', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  lotId: uuid('lot_id').references(() => lots.id, { onDelete: 'cascade' }).notNull(),
  email: varchar('email', { length: 320 }).notNull(),
  createdAt: timestamp('created_at').default(sql`now()`),
}, (table) => [
  index('reminder_user_idx').on(table.userId),
  uniqueIndex('reminder_unique_idx').on(table.userId, table.lotId),
]);

export const auctionReminderRelations = relations(auctionReminders, ({ one }) => ({
  user: one(users, {
    fields: [auctionReminders.userId],
    references: [users.id],
  }),
  lot: one(lots, {
    fields: [auctionReminders.lotId],
    references: [lots.id],
  }),
}));

export type AuctionReminder = typeof auctionReminders.$inferSelect;
