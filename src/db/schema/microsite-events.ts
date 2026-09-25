import { pgTable, uuid, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Leads are not an event here: they are counted from seller_prospects.site,
// which is the record of what actually arrived rather than what a browser
// reported.
export const micrositeEventTypeEnum = pgEnum('microsite_event_type', [
  'view',
  'call',
  'form_start',
]);

/**
 * Superseded by `site_events` (./site-events), which migration 0027 filled
 * with every row from here. Nothing writes or reads this table any more; it
 * stays only so the deployment that still writes it keeps working until the
 * release that stops. Drop it in a later migration.
 */
export const micrositeEvents = pgTable('microsite_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  site: text('site').notNull(),
  type: micrositeEventTypeEnum('type').notNull(),
  /** Where on the page a call or form start happened (header, hero, …). */
  placement: text('placement'),
  referrerHost: text('referrer_host'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  device: text('device'),
  visitorHash: text('visitor_hash'),
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
}, (table) => [
  index('microsite_events_site_created_idx').on(table.site, table.createdAt),
  index('microsite_events_created_idx').on(table.createdAt),
]).enableRLS();
