import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const aiChatSettings = pgTable('ai_chat_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  personality: text('personality'),
  customKnowledge: text('custom_knowledge'),
  upsellItems: text('upsell_items'),
  disallowedTopics: text('disallowed_topics'),
  greetingMessage: text('greeting_message'),
  enabled: boolean('enabled').default(true).notNull(),
  updatedAt: timestamp('updated_at').default(sql`now()`),
});

export type AiChatSettings = typeof aiChatSettings.$inferSelect;
