import { pgTable, uuid, text, timestamp, pgEnum, index, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Only what the browser alone knows is an event here. Form submissions and
// leads are counted from the records they create (seller_prospects,
// newsletter_subscribers, users) and answered calls from `calls`, which is
// what actually arrived rather than what a browser reported.
export const siteEventTypeEnum = pgEnum('site_event_type', [
  'view',
  'call',
  'form_start',
  'chat',
]);

/**
 * First-party traffic log for mayells.com and the city microsites, read by
 * the admin Analytics and Microsites pages. Written by /api/pv (SiteTracker
 * in the root layout) and, for `chat`, by the chat route.
 *
 * Holds no IP or user agent: `visitorHash` is a salted hash of both that
 * rotates daily, enough to count unique visitors per day and no more.
 * Location is the city Vercel resolves the IP to, never the IP.
 */
export const siteEvents = pgTable('site_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  /** `mayells` for mayells.com, else the microsite slug. Decided from the Host header, never by the client. */
  site: text('site').notNull(),
  type: siteEventTypeEnum('type').notNull(),
  /** Pathname with secret tokens replaced (see normalizePath); null for server-side events. */
  path: text('path'),
  /**
   * A view that began a visit: a page load that did not come from another
   * page of the same site. Visits and traffic sources are counted on these.
   */
  entry: boolean('entry').default(false).notNull(),
  /** Where on the page a call or form start happened (header, hero, …). */
  placement: text('placement'),
  /** The external site the visit came from; null for direct visits. */
  referrerHost: text('referrer_host'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  device: text('device'),
  country: text('country'),
  region: text('region'),
  city: text('city'),
  visitorHash: text('visitor_hash'),
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
}, (table) => [
  index('site_events_created_idx').on(table.createdAt),
  index('site_events_site_created_idx').on(table.site, table.createdAt),
]).enableRLS();
