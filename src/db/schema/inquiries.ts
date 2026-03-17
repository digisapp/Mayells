import { pgTable, uuid, varchar, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { lots } from './lots';
import { users } from './users';

export const inquiryStatusEnum = pgEnum('inquiry_status', [
  'new',
  'contacted',
  'in_progress',
  'closed',
]);

export const inquiries = pgTable('inquiries', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  lotId: uuid('lot_id').notNull().references(() => lots.id),
  userId: uuid('user_id').references(() => users.id),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 320 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  message: text('message'),
  status: inquiryStatusEnum('status').default('new').notNull(),
  adminNotes: text('admin_notes'),
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`now()`).notNull(),
});

export type Inquiry = typeof inquiries.$inferSelect;
export type NewInquiry = typeof inquiries.$inferInsert;
