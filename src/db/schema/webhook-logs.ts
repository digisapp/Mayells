import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const webhookLogs = pgTable('webhook_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

  // Source
  provider: varchar('provider', { length: 20 }).notNull(), // 'stripe' | 'resend'
  eventType: varchar('event_type', { length: 100 }).notNull(), // e.g. 'payment_intent.succeeded'
  eventId: varchar('event_id', { length: 255 }), // Stripe event id / Svix svix-id for deduplication

  // Outcome
  status: varchar('status', { length: 20 }).notNull().default('success'), // 'success' | 'failed' | 'ignored'
  errorMessage: text('error_message'),
  processingMs: integer('processing_ms'),

  // Raw data
  payload: jsonb('payload'), // full event object

  // Related entity for quick navigation
  relatedType: varchar('related_type', { length: 50 }), // 'invoice' | 'payment' | 'lot' | 'email'
  relatedId: varchar('related_id', { length: 255 }),

  // Replay tracking
  replayCount: integer('replay_count').notNull().default(0),
  lastReplayedAt: timestamp('last_replayed_at'),

  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (t) => [
  index('whl_provider_idx').on(t.provider),
  index('whl_status_idx').on(t.status),
  index('whl_event_type_idx').on(t.eventType),
  index('whl_created_at_idx').on(t.createdAt),
  index('whl_event_id_idx').on(t.eventId),
]);

export type WebhookLog = typeof webhookLogs.$inferSelect;
export type NewWebhookLog = typeof webhookLogs.$inferInsert;
