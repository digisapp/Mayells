import { pgTable, uuid, text, timestamp, boolean, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', ['buyer', 'seller', 'admin', 'auctioneer']);
export const accountStatusEnum = pgEnum('account_status', ['active', 'suspended', 'banned']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  fullName: text('full_name'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  role: userRoleEnum('role').default('buyer').notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
  accountStatus: accountStatusEnum('account_status').default('active').notNull(),

  // Buyer info
  paddleNumber: text('paddle_number').unique(),
  phone: text('phone'),
  shippingAddress: text('shipping_address'),
  shippingCity: text('shipping_city'),
  shippingState: text('shipping_state'),
  shippingZip: text('shipping_zip'),
  shippingCountry: text('shipping_country').default('US'),

  // Seller info
  companyName: text('company_name'),
  bio: text('bio'),

  // Stripe
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeConnectAccountId: text('stripe_connect_account_id').unique(),

  // Preferences
  emailNotifications: boolean('email_notifications').default(true),
  bidNotifications: boolean('bid_notifications').default(true),
  outbidNotifications: boolean('outbid_notifications').default(true),

  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
}, (table) => [
  index('users_role_idx').on(table.role),
  index('users_email_idx').on(table.email),
]);

// Relations defined in their respective schema files to avoid circular imports

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
