import { pgTable, uuid, varchar, timestamp, uniqueIndex, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: varchar('email', { length: 320 }).notNull(),
  subscribedAt: timestamp('subscribed_at').default(sql`now()`),
  unsubscribed: boolean('unsubscribed').default(false),
}, (table) => [
  uniqueIndex('newsletter_email_unique').on(table.email),
]);

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
