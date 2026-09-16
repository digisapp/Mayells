import { sql } from 'drizzle-orm';
import { db } from '@/db';

export interface AdminBadges {
  inbox: { unread: number; autoReplied: number };
  lots: { pendingReview: number; missingSeller: number };
  prospects: { awaiting: number; signed: number };
  appraisals: { review: number };
  invoices: { overdue: number; overdueCents: number; pending: number };
  payouts: { pending: number; pendingCents: number };
  shipments: { toShip: number; exception: number };
  webhooks: { failed24h: number };
  auctions: { settling: number; closing24h: number; live: number };
  outreach: { due: number };
}

/**
 * Counts that drive the sidebar badges and the dashboard action queue. One
 * round trip, all scalar subqueries, so polling it every minute is cheap.
 * Everything here is "needs a human": the number should go to zero as the
 * operator works through it.
 */
export async function getAdminBadges(): Promise<AdminBadges> {
  const { rows } = await db.execute(sql`
    select
      (select count(*) from emails
        where direction = 'inbound' and read_at is null and is_spam = false
          and archived_at is null)::int                                         as inbox_unread,
      (select count(*) from emails
        where direction = 'inbound' and ai_auto_sent = true and read_at is null
          and archived_at is null)::int                                         as inbox_auto_replied,
      (select count(*) from lots where status = 'pending_review')::int          as lots_pending_review,
      (select count(*) from lots
        where status in ('approved', 'for_sale', 'in_auction', 'sold') and seller_id is null)::int
                                                                                as lots_missing_seller,
      (select count(*) from seller_prospects
        where status in ('new', 'items_received', 'under_review'))::int         as prospects_awaiting,
      (select count(*) from seller_prospects
        where status = 'agreement_signed')::int                                 as prospects_signed,
      (select count(*) from estate_visits where status = 'review')::int         as appraisals_review,
      (select count(*) from invoices where status = 'overdue')::int             as invoices_overdue,
      (select coalesce(sum(total_amount), 0) from invoices where status = 'overdue')::bigint
                                                                                as invoices_overdue_cents,
      (select count(*) from invoices where status = 'pending')::int             as invoices_pending,
      (select count(*) from payouts where status = 'pending')::int              as payouts_pending,
      (select coalesce(sum(net_amount), 0) from payouts where status = 'pending')::bigint
                                                                                as payouts_pending_cents,
      (select count(*) from shipments
        where status in ('pending', 'needs_address', 'label_created', 'pickup_scheduled'))::int
                                                                                as shipments_to_ship,
      (select count(*) from shipments where status = 'exception')::int          as shipments_exception,
      (select count(*) from webhook_logs
        where status = 'failed' and created_at > now() - interval '24 hours')::int
                                                                                as webhooks_failed_24h,
      (select count(*) from auctions where status in ('closing', 'closed'))::int as auctions_settling,
      (select count(*) from auctions
        where status in ('open', 'live') and bidding_ends_at between now() and now() + interval '24 hours')::int
                                                                                as auctions_closing_24h,
      (select count(*) from auctions where status = 'live')::int                as auctions_live,
      (select count(*) from outreach_contacts
        where next_follow_up_at <= now()
          and status not in ('converted', 'not_interested', 'do_not_contact'))::int
                                                                                as outreach_due
  `);

  const r = rows[0] as Record<string, number | string>;
  const n = (v: number | string | undefined) => Number(v ?? 0);

  return {
    inbox: { unread: n(r.inbox_unread), autoReplied: n(r.inbox_auto_replied) },
    lots: { pendingReview: n(r.lots_pending_review), missingSeller: n(r.lots_missing_seller) },
    prospects: { awaiting: n(r.prospects_awaiting), signed: n(r.prospects_signed) },
    appraisals: { review: n(r.appraisals_review) },
    invoices: {
      overdue: n(r.invoices_overdue),
      overdueCents: n(r.invoices_overdue_cents),
      pending: n(r.invoices_pending),
    },
    payouts: { pending: n(r.payouts_pending), pendingCents: n(r.payouts_pending_cents) },
    shipments: { toShip: n(r.shipments_to_ship), exception: n(r.shipments_exception) },
    webhooks: { failed24h: n(r.webhooks_failed_24h) },
    auctions: {
      settling: n(r.auctions_settling),
      closing24h: n(r.auctions_closing_24h),
      live: n(r.auctions_live),
    },
    outreach: { due: n(r.outreach_due) },
  };
}
