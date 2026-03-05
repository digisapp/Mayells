import { pgTable, uuid, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const outreachCategoryEnum = pgEnum('outreach_category', [
  'estate_attorney',
  'trust_estate_planning',
  'elder_law',
  'wealth_management',
  'family_office',
  'cpa_tax',
  'divorce_attorney',
  'insurance',
  'estate_liquidator',
  'real_estate',
  'art_advisor',
  'bank_trust',
  'other',
]);

export const outreachStatusEnum = pgEnum('outreach_status', [
  'new',
  'contacted',
  'follow_up',
  'interested',
  'converted',
  'not_interested',
  'do_not_contact',
]);

export const outreachContacts = pgTable('outreach_contacts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyName: text('company_name').notNull(),
  contactName: text('contact_name'),
  title: text('title'),
  email: text('email'),
  phone: text('phone'),
  website: text('website'),
  category: outreachCategoryEnum('category').default('other').notNull(),
  status: outreachStatusEnum('status').default('new').notNull(),
  source: text('source'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  notes: text('notes'),
  lastContactedAt: timestamp('last_contacted_at'),
  nextFollowUpAt: timestamp('next_follow_up_at'),
  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('outreach_status_idx').on(table.status),
  index('outreach_category_idx').on(table.category),
  index('outreach_follow_up_idx').on(table.nextFollowUpAt),
]);

export type OutreachContact = typeof outreachContacts.$inferSelect;
export type NewOutreachContact = typeof outreachContacts.$inferInsert;
