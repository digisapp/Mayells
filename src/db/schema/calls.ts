import { pgTable, uuid, text, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { sellerProspects } from './seller-prospects';

export const callChannelEnum = pgEnum('call_channel', ['phone', 'web']);

/**
 * What a call came to. Set by the voice agent as the call goes: `lead` once
 * it records an appraisal request, `transferred` once it hands the caller to
 * a person. A call that ends with neither stays `info`.
 */
export const callOutcomeEnum = pgEnum('call_outcome', ['info', 'lead', 'transferred']);

/**
 * One conversation with the voice concierge (agents/voice-agent), opened by
 * the agent when it joins and closed when the caller hangs up.
 *
 * Deliberately no transcript and no audio: the call is not recorded, only
 * noted. The conversation is held in memory just long enough to write
 * `summary`, the way a receptionist writes a message slip, and the lead
 * itself lands on the prospect.
 */
export const calls = pgTable('calls', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  channel: callChannelEnum('channel').notNull(),
  /** LiveKit room; unique so a retried "start" from the agent is idempotent. */
  roomName: text('room_name').notNull().unique(),
  /** E.164 as LiveKit reports it; null for browser calls. */
  callerNumber: text('caller_number'),
  /** The Mayells number that was dialled — decides `site`. */
  calledNumber: text('called_number'),
  /** City microsite slug whose number was dialled; null for the main line. */
  site: text('site'),
  prospectId: uuid('prospect_id').references(() => sellerProspects.id, { onDelete: 'set null' }),
  outcome: callOutcomeEnum('outcome').default('info').notNull(),
  summary: text('summary'),
  startedAt: timestamp('started_at').default(sql`now()`).notNull(),
  endedAt: timestamp('ended_at'),
  durationSeconds: integer('duration_seconds'),
}, (table) => [
  index('calls_started_idx').on(table.startedAt),
  index('calls_prospect_idx').on(table.prospectId),
  index('calls_site_started_idx').on(table.site, table.startedAt),
]).enableRLS();
