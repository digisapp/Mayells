import { pgTable, uuid, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Automation settings — the control panel for AI vs manual operations.
 * Single row table (one global config). Each setting is a toggle with optional thresholds.
 */
export const automationSettings = pgTable('automation_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

  // Consignment auto-approval
  autoApproveConsignments: boolean('auto_approve_consignments').default(false).notNull(),
  autoApproveMaxValue: integer('auto_approve_max_value').default(500000), // $5,000 in cents — items above this require manual review
  autoApproveMinConfidence: integer('auto_approve_min_confidence').default(70), // AI confidence 0-100 required for auto-approve
  autoApproveRequireAddress: boolean('auto_approve_require_address').default(true).notNull(), // require seller address before auto-approve

  // AI cataloging
  aiAutoCatalog: boolean('ai_auto_catalog').default(true).notNull(), // auto-generate title/description on consignment submission
  aiAutoAppraise: boolean('ai_auto_appraise').default(true).notNull(), // auto-appraise on submission
  requireCatalogReview: boolean('require_catalog_review').default(false).notNull(), // require admin review of AI descriptions

  // Auction automation
  autoScheduleAuctions: boolean('auto_schedule_auctions').default(false).notNull(),
  autoScheduleMinLots: integer('auto_schedule_min_lots').default(20), // min lots to trigger auto-schedule
  autoScheduleDayOfWeek: integer('auto_schedule_day_of_week').default(2), // 0=Sun, 2=Tue
  autoScheduleHour: integer('auto_schedule_hour').default(10), // 10 AM

  // Invoice & payment
  autoInvoiceOnClose: boolean('auto_invoice_on_close').default(true).notNull(), // auto-create invoice when lot closes
  invoiceDueDays: integer('invoice_due_days').default(7), // days until invoice is overdue

  // Shipping
  autoCreateShipment: boolean('auto_create_shipment').default(true).notNull(), // auto-create shipment record on payment
  autoGenerateLabel: boolean('auto_generate_label').default(false).notNull(), // auto-generate shipping label on payment
  defaultCarrier: text('default_carrier').default('fedex'), // default shipping carrier
  requireSignature: boolean('require_signature').default(true).notNull(),
  requireInsurance: boolean('require_insurance').default(true).notNull(),
  whiteGloveThreshold: integer('white_glove_threshold').default(100000), // $1,000 — items above this get white glove suggestion

  // Commission
  defaultCommissionPercent: integer('default_commission_percent').default(25), // 25% default commission
  highValueCommissionPercent: integer('high_value_commission_percent').default(15), // lower commission for high-value items
  highValueThreshold: integer('high_value_threshold').default(1000000), // $10,000 threshold for lower commission

  // AI Email Auto-Reply
  aiEmailAutoReply: boolean('ai_email_auto_reply').default(false).notNull(), // when ON, AI sends replies automatically
  // when OFF (default), AI drafts a reply but you click Send manually

  // Prospect follow-up automation
  autoFollowUpProspects: boolean('auto_follow_up_prospects').default(false).notNull(), // auto-send follow-up emails to unresponsive prospects
  followUpDelayHours: integer('follow_up_delay_hours').default(48), // hours to wait before sending first follow-up
  followUpUploadReminderHours: integer('follow_up_upload_reminder_hours').default(72), // hours to wait before reminding about upload link

  // Notifications
  notifySellerOnApproval: boolean('notify_seller_on_approval').default(true).notNull(),
  notifySellerOnSale: boolean('notify_seller_on_sale').default(true).notNull(),
  notifySellerOnShipment: boolean('notify_seller_on_shipment').default(true).notNull(),
  notifyBuyerOnShipment: boolean('notify_buyer_on_shipment').default(true).notNull(),
  sendDailyDigest: boolean('send_daily_digest').default(true).notNull(), // daily report to admin

  updatedAt: timestamp('updated_at').default(sql`now()`),
  updatedById: uuid('updated_by_id'),
});

export type AutomationSettings = typeof automationSettings.$inferSelect;
