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
 * First-party traffic log for the city microsites, so the admin can see
 * visits and call taps next to the leads they produced. Vercel Analytics
 * still receives the same events; this copy is what the admin reads.
 *
 * Holds no IP or user agent: `visitorHash` is a salted hash of both that
 * rotates daily, enough to count unique visitors per day and no more.
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
