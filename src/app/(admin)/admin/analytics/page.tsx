export const dynamic = 'force-dynamic';

import { db } from '@/db';
import {
  lots,
  auctions,
  users,
  invoices,
  payouts,
  bids,
  consignments,
  outreachContacts,
  watchlist,
} from '@/db/schema';
import { sql, type SQL } from 'drizzle-orm';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { PageHeader } from '@/components/admin/PageHeader';
import { fmt } from './fmt';
import { KeyMetrics, type KeyMetric } from './key-metrics';
import { StatsBreakdownCards, type StatsSection } from './stats-breakdown-cards';
import { TopDepartmentsCard } from './top-departments-card';
import { RecentBidsCard, type RecentBid } from './recent-bids-card';
import { SalesReportCard, type SaleRow } from './sales-report-card';
import { RangeSwitch, RANGES, parseRange } from './range-switch';

// pg returns count()/sum() as strings (bigint); normalise once at the edge.
const n = (v: unknown) => Number(v ?? 0);

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdminPage();
  const { range: rangeParam } = await searchParams;
  const range = parseRange(rangeParam);
  const { days, label: rangeLabel } = RANGES.find((r) => r.value === range)!;
  const rangeTag = days ? `${days}d` : 'all time';

  /** `col >= now() - N days`, or always-true for "all time". */
  const inRange = (col: unknown): SQL =>
    days ? sql`${col} >= now() - (${days}::int * interval '1 day')` : sql`true`;
  /** `col >= now() - '24 hours'` etc. for the fixed 24h / 7d / 30d columns. */
  const within = (col: unknown, interval: string): SQL => sql`${col} >= now() - ${interval}::interval`;

  // Bids that were retracted (withdrawn lots) are not activity — exclude
  // them from every rate, average and "recent" view; they are still counted
  // in the status breakdown so the totals reconcile.
  const liveBid = sql`${bids.status} <> 'retracted'`;

  const [
    [lotStats],
    [auctionStats],
    [userStats],
    [invoiceStats],
    [payoutStats],
    [bidStats],
    [consignmentStats],
    [outreachStats],
    [watchlistStats],
    topCategoriesResult,
    recentBidsResult,
    salesReportResult,
  ] = await Promise.all([
    db.select({
      total: sql<number>`count(*)::int`,
      draft: sql<number>`count(*) filter (where ${lots.status} = 'draft')::int`,
      pendingReview: sql<number>`count(*) filter (where ${lots.status} = 'pending_review')::int`,
      approved: sql<number>`count(*) filter (where ${lots.status} = 'approved')::int`,
      forSale: sql<number>`count(*) filter (where ${lots.status} = 'for_sale')::int`,
      inAuction: sql<number>`count(*) filter (where ${lots.status} = 'in_auction')::int`,
      sold: sql<number>`count(*) filter (where ${lots.status} = 'sold')::int`,
      unsold: sql<number>`count(*) filter (where ${lots.status} = 'unsold')::int`,
      withdrawn: sql<number>`count(*) filter (where ${lots.status} = 'withdrawn')::int`,
      soldHammer: sql<number>`coalesce(sum(${lots.hammerPrice}) filter (where ${lots.status} = 'sold'), 0)`,
    }).from(lots),

    db.select({
      total: sql<number>`count(*)::int`,
      draft: sql<number>`count(*) filter (where ${auctions.status} = 'draft')::int`,
      scheduled: sql<number>`count(*) filter (where ${auctions.status} = 'scheduled')::int`,
      preview: sql<number>`count(*) filter (where ${auctions.status} = 'preview')::int`,
      open: sql<number>`count(*) filter (where ${auctions.status} = 'open')::int`,
      live: sql<number>`count(*) filter (where ${auctions.status} = 'live')::int`,
      closing: sql<number>`count(*) filter (where ${auctions.status} = 'closing')::int`,
      closed: sql<number>`count(*) filter (where ${auctions.status} = 'closed')::int`,
      completed: sql<number>`count(*) filter (where ${auctions.status} = 'completed')::int`,
      cancelled: sql<number>`count(*) filter (where ${auctions.status} = 'cancelled')::int`,
    }).from(auctions),

    db.select({
      total: sql<number>`count(*)::int`,
      buyers: sql<number>`count(*) filter (where ${users.role} = 'buyer')::int`,
      sellers: sql<number>`count(*) filter (where ${users.role} = 'seller')::int`,
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
      auctioneers: sql<number>`count(*) filter (where ${users.role} = 'auctioneer')::int`,
      new24h: sql<number>`count(*) filter (where ${within(users.createdAt, '24 hours')})::int`,
      new7d: sql<number>`count(*) filter (where ${within(users.createdAt, '7 days')})::int`,
      new30d: sql<number>`count(*) filter (where ${within(users.createdAt, '30 days')})::int`,
      newInRange: sql<number>`count(*) filter (where ${inRange(users.createdAt)})::int`,
    }).from(users),

    db.select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${invoices.status} = 'pending')::int`,
      paid: sql<number>`count(*) filter (where ${invoices.status} = 'paid')::int`,
      overdue: sql<number>`count(*) filter (where ${invoices.status} = 'overdue')::int`,
      cancelled: sql<number>`count(*) filter (where ${invoices.status} = 'cancelled')::int`,
      refunded: sql<number>`count(*) filter (where ${invoices.status} = 'refunded')::int`,
      overdueAmount: sql<number>`coalesce(sum(${invoices.totalAmount}) filter (where ${invoices.status} = 'overdue'), 0)`,
      pendingAmount: sql<number>`coalesce(sum(${invoices.totalAmount}) filter (where ${invoices.status} = 'pending'), 0)`,
      // House revenue, premium half: only premium actually collected counts.
      premiumPaidAll: sql<number>`coalesce(sum(${invoices.buyerPremium}) filter (where ${invoices.status} = 'paid'), 0)`,
      premiumPaidInRange: sql<number>`coalesce(sum(${invoices.buyerPremium}) filter (where ${invoices.status} = 'paid' and ${inRange(sql`coalesce(${invoices.paidAt}, ${invoices.updatedAt})`)}), 0)`,
      // Gross sales: hammer on every live invoice (a refund undoes the sale).
      grossInRange: sql<number>`coalesce(sum(${invoices.hammerPrice}) filter (where ${invoices.status} in ('pending', 'paid', 'overdue') and ${inRange(invoices.createdAt)}), 0)`,
      grossCountInRange: sql<number>`count(*) filter (where ${invoices.status} in ('pending', 'paid', 'overdue') and ${inRange(invoices.createdAt)})::int`,
    }).from(invoices),

    db.select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${payouts.status} = 'pending')::int`,
      paid: sql<number>`count(*) filter (where ${payouts.status} = 'paid')::int`,
      cancelled: sql<number>`count(*) filter (where ${payouts.status} = 'cancelled')::int`,
      pendingAmount: sql<number>`coalesce(sum(${payouts.netAmount}) filter (where ${payouts.status} = 'pending'), 0)`,
      paidAmount: sql<number>`coalesce(sum(${payouts.netAmount}) filter (where ${payouts.status} = 'paid'), 0)`,
      // House revenue, commission half: earned once the payout exists (the
      // buyer has paid), whether or not the seller has been paid out yet.
      commissionAll: sql<number>`coalesce(sum(${payouts.commissionAmount}) filter (where ${payouts.status} in ('pending', 'paid')), 0)`,
      commissionInRange: sql<number>`coalesce(sum(${payouts.commissionAmount}) filter (where ${payouts.status} in ('pending', 'paid') and ${inRange(payouts.createdAt)}), 0)`,
    }).from(payouts),

    db.select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${bids.status} = 'active')::int`,
      outbid: sql<number>`count(*) filter (where ${bids.status} = 'outbid')::int`,
      winning: sql<number>`count(*) filter (where ${bids.status} = 'winning')::int`,
      won: sql<number>`count(*) filter (where ${bids.status} = 'won')::int`,
      retracted: sql<number>`count(*) filter (where ${bids.status} = 'retracted')::int`,
      h24: sql<number>`count(*) filter (where ${liveBid} and ${within(bids.createdAt, '24 hours')})::int`,
      d7: sql<number>`count(*) filter (where ${liveBid} and ${within(bids.createdAt, '7 days')})::int`,
      d30: sql<number>`count(*) filter (where ${liveBid} and ${within(bids.createdAt, '30 days')})::int`,
      inRange: sql<number>`count(*) filter (where ${liveBid} and ${inRange(bids.createdAt)})::int`,
      // "Registered bidders" used to read auctions.registeredBidders, a
      // denormalised counter nothing writes to. Count the people who bid.
      bidders: sql<number>`count(distinct ${bids.bidderId}) filter (where ${liveBid})::int`,
      biddersInRange: sql<number>`count(distinct ${bids.bidderId}) filter (where ${liveBid} and ${inRange(bids.createdAt)})::int`,
      avgAmount: sql<number>`coalesce(avg(${bids.amount}) filter (where ${liveBid}), 0)`,
      maxAmount: sql<number>`coalesce(max(${bids.amount}) filter (where ${liveBid}), 0)`,
    }).from(bids),

    db.select({
      total: sql<number>`count(*)::int`,
      submitted: sql<number>`count(*) filter (where ${consignments.status} = 'submitted')::int`,
      underReview: sql<number>`count(*) filter (where ${consignments.status} = 'under_review')::int`,
      approved: sql<number>`count(*) filter (where ${consignments.status} = 'approved')::int`,
      declined: sql<number>`count(*) filter (where ${consignments.status} = 'declined')::int`,
      listed: sql<number>`count(*) filter (where ${consignments.status} = 'listed')::int`,
      sold: sql<number>`count(*) filter (where ${consignments.status} = 'sold')::int`,
      returned: sql<number>`count(*) filter (where ${consignments.status} = 'returned')::int`,
    }).from(consignments),

    db.select({
      total: sql<number>`count(*)::int`,
      new: sql<number>`count(*) filter (where ${outreachContacts.status} = 'new')::int`,
      contacted: sql<number>`count(*) filter (where ${outreachContacts.status} = 'contacted')::int`,
      followUp: sql<number>`count(*) filter (where ${outreachContacts.status} = 'follow_up')::int`,
      interested: sql<number>`count(*) filter (where ${outreachContacts.status} = 'interested')::int`,
      converted: sql<number>`count(*) filter (where ${outreachContacts.status} = 'converted')::int`,
      notInterested: sql<number>`count(*) filter (where ${outreachContacts.status} = 'not_interested')::int`,
      doNotContact: sql<number>`count(*) filter (where ${outreachContacts.status} = 'do_not_contact')::int`,
    }).from(outreachContacts),

    db.select({ total: sql<number>`count(*)::int` }).from(watchlist),

    db.execute(sql`
      SELECT c.name,
        count(l.id)::int AS lot_count,
        count(l.id) FILTER (WHERE l.status = 'sold')::int AS sold_count,
        coalesce(sum(l.hammer_price) FILTER (WHERE l.status = 'sold'), 0)::bigint AS hammer
      FROM categories c
      LEFT JOIN lots l ON l.category_id = c.id
      GROUP BY c.id, c.name
      ORDER BY lot_count DESC
      LIMIT 6
    `),

    db.execute(sql`
      SELECT b.id, b.lot_id, b.amount, b.bid_status AS status, b.created_at,
        l.title AS lot_title,
        coalesce(u.full_name, u.display_name, u.email) AS bidder_name
      FROM bids b
      JOIN lots l ON l.id = b.lot_id
      JOIN users u ON u.id = b.bidder_id
      WHERE b.bid_status <> 'retracted'
      ORDER BY b.created_at DESC
      LIMIT 10
    `),

    // Sales report: one row per completed sale. "Sold" is the invoice record
    // (a lot can be relisted in a later sale, so lots.status can't say which
    // sale sold it); a refunded/cancelled invoice is not a sale. Estimates are
    // summed over the sold lots so "vs estimate" compares like with like.
    db.execute(sql`
      WITH sales AS (
        SELECT a.id, a.title, a.sale_number,
          coalesce(a.actual_ended_at, a.bidding_ends_at, a.updated_at) AS ended_at
        FROM auctions a
        WHERE a.status = 'completed'
        ORDER BY coalesce(a.actual_ended_at, a.bidding_ends_at, a.updated_at) DESC NULLS LAST
        LIMIT 20
      ),
      offered AS (
        SELECT al.auction_id, count(*)::int AS lots_offered
        FROM auction_lots al
        WHERE al.auction_id IN (SELECT id FROM sales)
        GROUP BY al.auction_id
      ),
      sold AS (
        SELECT i.auction_id,
          count(*)::int AS lots_sold,
          coalesce(sum(i.hammer_price), 0)::bigint AS hammer_total,
          coalesce(sum(l.estimate_low), 0)::bigint AS est_low_sold,
          coalesce(sum(l.estimate_high), 0)::bigint AS est_high_sold,
          coalesce(sum(i.buyer_premium), 0)::bigint AS premium,
          count(*) FILTER (WHERE i.status = 'paid')::int AS invoices_paid,
          coalesce(sum(i.total_amount), 0)::bigint AS billed,
          coalesce(sum(i.total_amount) FILTER (WHERE i.status = 'paid'), 0)::bigint AS collected
        FROM invoices i
        JOIN lots l ON l.id = i.lot_id
        WHERE i.auction_id IN (SELECT id FROM sales)
          AND i.status IN ('pending', 'paid', 'overdue')
        GROUP BY i.auction_id
      ),
      commission AS (
        SELECT i.auction_id, coalesce(sum(p.commission_amount), 0)::bigint AS commission
        FROM payouts p
        JOIN invoices i ON i.id = p.invoice_id
        WHERE i.auction_id IN (SELECT id FROM sales) AND p.status <> 'cancelled'
        GROUP BY i.auction_id
      )
      SELECT s.id, s.title, s.sale_number, s.ended_at,
        coalesce(o.lots_offered, 0) AS lots_offered,
        coalesce(d.lots_sold, 0) AS lots_sold,
        coalesce(d.hammer_total, 0) AS hammer_total,
        coalesce(d.est_low_sold, 0) AS est_low_sold,
        coalesce(d.est_high_sold, 0) AS est_high_sold,
        coalesce(d.premium, 0) AS premium,
        coalesce(c.commission, 0) AS commission,
        coalesce(d.lots_sold, 0) AS invoices,
        coalesce(d.invoices_paid, 0) AS invoices_paid,
        coalesce(d.billed, 0) AS billed,
        coalesce(d.collected, 0) AS collected
      FROM sales s
      LEFT JOIN offered o ON o.auction_id = s.id
      LEFT JOIN sold d ON d.auction_id = s.id
      LEFT JOIN commission c ON c.auction_id = s.id
      ORDER BY s.ended_at DESC NULLS LAST
    `),
  ]);

  // db.execute returns a node-postgres QueryResult; the row arrays live on .rows
  const topCategories = topCategoriesResult.rows as unknown as { name: string; lot_count: number; sold_count: number; hammer: number }[];
  const recentBids = recentBidsResult.rows as unknown as RecentBid[];
  const sales = salesReportResult.rows as unknown as SaleRow[];

  const houseRevenueInRange = n(invoiceStats.premiumPaidInRange) + n(payoutStats.commissionInRange);
  const houseRevenueAll = n(invoiceStats.premiumPaidAll) + n(payoutStats.commissionAll);
  const conversionRate = n(outreachStats.total) > 0
    ? ((n(outreachStats.converted) / n(outreachStats.total)) * 100).toFixed(1)
    : '0';

  const keyMetrics: KeyMetric[] = [
    {
      label: `House revenue · ${rangeTag}`,
      value: fmt(houseRevenueInRange),
      sub: `premium ${fmt(n(invoiceStats.premiumPaidInRange))} + commission ${fmt(n(payoutStats.commissionInRange))}`,
      hint: "Buyer's premium on paid invoices plus seller commission on payouts (pending or paid). Not hammer.",
    },
    {
      label: `Gross sales (hammer) · ${rangeTag}`,
      value: fmt(n(invoiceStats.grossInRange)),
      sub: `${n(invoiceStats.grossCountInRange).toLocaleString()} lots invoiced`,
      hint: 'Hammer price on live invoices (pending, paid, overdue) issued in the period. The seller and house split this.',
    },
    {
      label: 'Overdue receivables',
      value: fmt(n(invoiceStats.overdueAmount)),
      sub: `${n(invoiceStats.overdue).toLocaleString()} invoices past due`,
      tone: n(invoiceStats.overdueAmount) > 0 ? 'problem' : undefined,
      hint: 'Invoice totals (hammer + premium + costs) past their due date and unpaid. Current state, not range-dependent.',
    },
    {
      label: 'Payouts pending',
      value: fmt(n(payoutStats.pendingAmount)),
      sub: `${n(payoutStats.pending).toLocaleString()} sellers owed`,
      hint: 'Net amounts owed to consignors on paid lots that have not been paid out. Current state, not range-dependent.',
    },
    {
      label: `Bids · ${rangeTag}`,
      value: n(bidStats.inRange).toLocaleString(),
      sub: `${n(bidStats.biddersInRange).toLocaleString()} bidders`,
      hint: 'Bids placed in the period, excluding retracted bids.',
    },
    {
      label: `New users · ${rangeTag}`,
      value: n(userStats.newInRange).toLocaleString(),
      sub: `${n(userStats.total).toLocaleString()} total`,
    },
  ];

  const breakdownSections: StatsSection[] = [
    {
      title: 'Lots',
      items: [
        { label: 'Total', value: n(lotStats.total) },
        { label: 'Draft', value: n(lotStats.draft) },
        { label: 'Pending review', value: n(lotStats.pendingReview) },
        { label: 'Approved', value: n(lotStats.approved) },
        { label: 'For sale', value: n(lotStats.forSale) },
        { label: 'In auction', value: n(lotStats.inAuction) },
        { label: 'Sold', value: n(lotStats.sold) },
        { label: 'Unsold', value: n(lotStats.unsold) },
        { label: 'Withdrawn', value: n(lotStats.withdrawn) },
      ],
      footer: [{ label: 'Sold value (hammer)', value: fmt(n(lotStats.soldHammer)) }],
    },
    {
      title: 'Auctions',
      items: [
        { label: 'Total', value: n(auctionStats.total) },
        { label: 'Draft', value: n(auctionStats.draft) },
        { label: 'Scheduled', value: n(auctionStats.scheduled) },
        { label: 'Preview', value: n(auctionStats.preview) },
        { label: 'Open', value: n(auctionStats.open) },
        { label: 'Live', value: n(auctionStats.live) },
        { label: 'Closing', value: n(auctionStats.closing) },
        { label: 'Closed', value: n(auctionStats.closed) },
        { label: 'Completed', value: n(auctionStats.completed) },
        { label: 'Cancelled', value: n(auctionStats.cancelled) },
      ],
    },
    {
      title: 'Bidding',
      items: [
        { label: 'Total', value: n(bidStats.total) },
        { label: 'Active', value: n(bidStats.active) },
        { label: 'Outbid', value: n(bidStats.outbid) },
        { label: 'Winning', value: n(bidStats.winning) },
        { label: 'Won', value: n(bidStats.won) },
        { label: 'Retracted', value: n(bidStats.retracted) },
      ],
      footer: [
        { label: '24h', value: n(bidStats.h24) },
        { label: '7d', value: n(bidStats.d7) },
        { label: '30d', value: n(bidStats.d30) },
        { label: 'Unique bidders', value: n(bidStats.bidders) },
        { label: 'Avg bid', value: fmt(n(bidStats.avgAmount)) },
        { label: 'Highest bid', value: fmt(n(bidStats.maxAmount)) },
      ],
    },
    {
      title: 'Invoices',
      items: [
        { label: 'Total', value: n(invoiceStats.total) },
        { label: 'Pending', value: n(invoiceStats.pending) },
        { label: 'Paid', value: n(invoiceStats.paid) },
        { label: 'Overdue', value: n(invoiceStats.overdue) },
        { label: 'Cancelled', value: n(invoiceStats.cancelled) },
        { label: 'Refunded', value: n(invoiceStats.refunded) },
      ],
      footer: [
        { label: 'Overdue amount', value: fmt(n(invoiceStats.overdueAmount)) },
        { label: 'Pending amount', value: fmt(n(invoiceStats.pendingAmount)) },
        { label: 'Premium collected', value: fmt(n(invoiceStats.premiumPaidAll)) },
      ],
    },
    {
      title: 'Payouts',
      items: [
        { label: 'Total', value: n(payoutStats.total) },
        { label: 'Pending', value: n(payoutStats.pending) },
        { label: 'Paid', value: n(payoutStats.paid) },
        { label: 'Cancelled', value: n(payoutStats.cancelled) },
      ],
      footer: [
        { label: 'Pending amount', value: fmt(n(payoutStats.pendingAmount)) },
        { label: 'Paid out', value: fmt(n(payoutStats.paidAmount)) },
        { label: 'Commission earned', value: fmt(n(payoutStats.commissionAll)) },
        { label: 'House revenue (all time)', value: fmt(houseRevenueAll) },
      ],
    },
    {
      title: 'Users',
      items: [
        { label: 'Total', value: n(userStats.total) },
        { label: 'Buyers', value: n(userStats.buyers) },
        { label: 'Sellers', value: n(userStats.sellers) },
        { label: 'Admins', value: n(userStats.admins) },
        { label: 'Auctioneers', value: n(userStats.auctioneers) },
      ],
      footer: [
        { label: 'New 24h', value: n(userStats.new24h) },
        { label: 'New 7d', value: n(userStats.new7d) },
        { label: 'New 30d', value: n(userStats.new30d) },
        { label: 'Watchlist saves', value: n(watchlistStats.total) },
      ],
    },
    {
      title: 'Consignments',
      items: [
        { label: 'Total', value: n(consignmentStats.total) },
        { label: 'Submitted', value: n(consignmentStats.submitted) },
        { label: 'Under review', value: n(consignmentStats.underReview) },
        { label: 'Approved', value: n(consignmentStats.approved) },
        { label: 'Declined', value: n(consignmentStats.declined) },
        { label: 'Listed', value: n(consignmentStats.listed) },
        { label: 'Sold', value: n(consignmentStats.sold) },
        { label: 'Returned', value: n(consignmentStats.returned) },
      ],
    },
    {
      title: 'Outreach CRM',
      items: [
        { label: 'Total', value: n(outreachStats.total) },
        { label: 'New', value: n(outreachStats.new) },
        { label: 'Contacted', value: n(outreachStats.contacted) },
        { label: 'Follow-up', value: n(outreachStats.followUp) },
        { label: 'Interested', value: n(outreachStats.interested) },
        { label: 'Converted', value: n(outreachStats.converted) },
        { label: 'Not interested', value: n(outreachStats.notInterested) },
        { label: 'Do not contact', value: n(outreachStats.doNotContact) },
      ],
      footer: [
        { label: 'Conversion rate', value: `${conversionRate}%` },
        { label: 'Needs follow-up', value: n(outreachStats.new) + n(outreachStats.followUp) },
      ],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Analytics"
        description={<>Money tiles marked &ldquo;{rangeTag}&rdquo; cover {rangeLabel.toLowerCase()}; everything else is current state.</>}
        actions={<RangeSwitch current={range} />}
      />

      <KeyMetrics metrics={keyMetrics} />

      <SalesReportCard sales={sales} />

      <StatsBreakdownCards sections={breakdownSections} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TopDepartmentsCard categories={topCategories} />
        <RecentBidsCard bids={recentBids} />
      </div>
    </div>
  );
}
