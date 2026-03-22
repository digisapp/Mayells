import { pgTable, uuid, varchar, text, timestamp, pgEnum, boolean, index, real } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const emailDirectionEnum = pgEnum('email_direction', ['inbound', 'outbound']);

export const emailStatusEnum = pgEnum('email_status', [
  'received',   // inbound: just arrived
  'read',       // inbound: admin opened it
  'replied',    // inbound: admin replied to it
  'sent',       // outbound: sent via Resend
  'delivered',  // outbound: confirmed delivered
  'bounced',    // outbound: delivery failed
]);

export const emails = pgTable('emails', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  resendId: varchar('resend_id', { length: 255 }),
  direction: emailDirectionEnum('direction').notNull(),
  status: emailStatusEnum('status').notNull().default('received'),
  fromEmail: varchar('from_email', { length: 320 }).notNull(),
  fromName: varchar('from_name', { length: 255 }),
  toEmail: varchar('to_email', { length: 320 }).notNull(),
  toName: varchar('to_name', { length: 255 }),
  subject: varchar('subject', { length: 1000 }),
  bodyHtml: text('body_html'),
  bodyText: text('body_text'),
  // Threading
  messageId: varchar('message_id', { length: 500 }),
  inReplyToMessageId: varchar('in_reply_to_message_id', { length: 500 }),
  inReplyToId: uuid('in_reply_to_id'),
  threadId: uuid('thread_id'),
  // User linking — matches sender/recipient to a registered user
  userId: uuid('user_id').references(() => users.id),
  // AI draft — generated response awaiting admin approval or auto-sent
  aiDraftHtml: text('ai_draft_html'),
  aiDraftText: text('ai_draft_text'),
  aiDraftedAt: timestamp('ai_drafted_at'),
  aiAutoSent: boolean('ai_auto_sent').default(false).notNull(),
  // AI classification
  aiCategory: varchar('ai_category', { length: 100 }),
  aiConfidence: real('ai_confidence'),
  aiSummary: text('ai_summary'),
  // Spam filtering
  isSpam: boolean('is_spam').default(false).notNull(),
  // Timestamps
  readAt: timestamp('read_at'),
  repliedAt: timestamp('replied_at'),
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
}, (table) => [
  index('emails_direction_idx').on(table.direction),
  index('emails_status_idx').on(table.status),
  index('emails_from_email_idx').on(table.fromEmail),
  index('emails_to_email_idx').on(table.toEmail),
  index('emails_thread_id_idx').on(table.threadId),
  index('emails_message_id_idx').on(table.messageId),
  index('emails_created_at_idx').on(table.createdAt),
  index('emails_user_id_idx').on(table.userId),
]);

export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
