export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { lots, auctions, users, invoices, bids, consignments, outreachContacts, watchlist } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function fmt(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default async function AdminAnalyticsPage() {
  const [
    [lotStats],
    [auctionStats],
    [userStats],
    [revenueStats],
    [bidStats],
    [consignmentStats],
    [outreachStats],
    [watchlistStats],
    topCategories,
    recentBids,
  ] = await Promise.all([
    db.select({
      total: sql<number>`count(*)`,
      sold: sql<number>`count(*) filter (where ${lots.status} = 'sold')`,
      forSale: sql<number>`count(*) filter (where ${lots.status} = 'for_sale')`,
      inAuction: sql<number>`count(*) filter (where ${lots.status} = 'in_auction')`,
      draft: sql<number>`count(*) filter (where ${lots.status} = 'draft')`,
      avgEstimate: sql<number>`coalesce(avg(${lots.estimateLow}), 0)`,
      totalValue: sql<number>`coalesce(sum(${lots.hammerPrice}) filter (where ${lots.status} = 'sold'), 0)`,
    }).from(lots),

    db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${auctions.status} in ('open', 'live', 'preview'))`,
      completed: sql<number>`count(*) filter (where ${auctions.status} = 'completed')`,
      scheduled: sql<number>`count(*) filter (where ${auctions.status} = 'scheduled')`,
      totalBids: sql<number>`coalesce(sum(${auctions.totalBids}), 0)`,
      totalBidders: sql<number>`coalesce(sum(${auctions.registeredBidders}), 0)`,
    }).from(auctions),

    db.select({
      total: sql<number>`count(*)`,
      buyers: sql<number>`count(*) filter (where ${users.role} = 'buyer')`,
      sellers: sql<number>`count(*) filter (where ${users.role} = 'seller')`,
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')`,
      thisWeek: sql<number>`count(*) filter (where ${users.createdAt} >= now() - interval '7 days')`,
      thisMonth: sql<number>`count(*) filter (where ${users.createdAt} >= now() - interval '30 days')`,
    }).from(users),

    db.select({
      total: sql<number>`coalesce(sum(${invoices.totalAmount}), 0)`,
      paid: sql<number>`coalesce(sum(${invoices.totalAmount}) filter (where ${invoices.status} = 'paid'), 0)`,
      pending: sql<number>`coalesce(sum(${invoices.totalAmount}) filter (where ${invoices.status} = 'pending'), 0)`,
      overdue: sql<number>`coalesce(sum(${invoices.totalAmount}) filter (where ${invoices.status} = 'overdue'), 0)`,
      count: sql<number>`count(*)`,
      paidCount: sql<number>`count(*) filter (where ${invoices.status} = 'paid')`,
    }).from(invoices),

    db.select({
      total: sql<number>`count(*)`,
      today: sql<number>`count(*) filter (where ${bids.createdAt} >= now() - interval '24 hours')`,
      thisWeek: sql<number>`count(*) filter (where ${bids.createdAt} >= now() - interval '7 days')`,
      avgAmount: sql<number>`coalesce(avg(${bids.amount}), 0)`,
      maxAmount: sql<number>`coalesce(max(${bids.amount}), 0)`,
      uniqueBidders: sql<number>`count(distinct ${bids.bidderId})`,
    }).from(bids),

    db.select({
      total: sql<number>`count(*)`,
      submitted: sql<number>`count(*) filter (where ${consignments.status} = 'submitted')`,
      approved: sql<number>`count(*) filter (where ${consignments.status} = 'approved')`,
      listed: sql<number>`count(*) filter (where ${consignments.status} = 'listed')`,
      sold: sql<number>`count(*) filter (where ${consignments.status} = 'sold')`,
    }).from(consignments),

    db.select({
      total: sql<number>`count(*)`,
      new: sql<number>`count(*) filter (where ${outreachContacts.status} = 'new')`,
      converted: sql<number>`count(*) filter (where ${outreachContacts.status} = 'converted')`,
      interested: sql<number>`count(*) filter (where ${outreachContacts.status} = 'interested')`,
      needsFollowUp: sql<number>`count(*) filter (where ${outreachContacts.status} in ('new', 'follow_up'))`,
    }).from(outreachContacts),

    db.select({
      total: sql<number>`count(*)`,
    }).from(watchlist),

    db.execute(sql`
      SELECT c.name, count(l.id) as lot_count,
        count(l.id) filter (where l.status = 'sold') as sold_count,
        coalesce(sum(l.hammer_price) filter (where l.status = 'sold'), 0) as revenue
      FROM categories c
      LEFT JOIN lots l ON l.category_id = c.id
      GROUP BY c.id, c.name
      ORDER BY lot_count DESC
      LIMIT 6
    `),

    db.execute(sql`
      SELECT b.amount, b.created_at, l.title as lot_title, u.full_name as bidder_name
      FROM bids b
      JOIN lots l ON l.id = b.lot_id
      JOIN users u ON u.id = b.bidder_id
      ORDER BY b.created_at DESC
      LIMIT 10
    `),
  ]);

  const conversionRate = outreachStats.total > 0
    ? ((Number(outreachStats.converted) / Number(outreachStats.total)) * 100).toFixed(1)
    : '0';

  return (
    <div>
      <h1 className="font-display text-display-sm mb-8">Analytics</h1>

      {/* Key metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
        {[
          { label: 'Total Revenue', value: fmt(Number(revenueStats.paid)), sub: 'paid' },
          { label: 'Pending', value: fmt(Number(revenueStats.pending)), sub: `${revenueStats.count} invoices` },
          { label: 'Total Bids', value: Number(bidStats.total).toLocaleString(), sub: `${Number(bidStats.today)} today` },
          { label: 'Active Users', value: Number(userStats.total).toLocaleString(), sub: `+${Number(userStats.thisWeek)} this week` },
          { label: 'Watchlist Saves', value: Number(watchlistStats.total).toLocaleString(), sub: 'total saves' },
          { label: 'Outreach Conversion', value: `${conversionRate}%`, sub: `${Number(outreachStats.converted)}/${Number(outreachStats.total)}` },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="pt-5 pb-4">
              <p className="text-2xl font-semibold">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">{m.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Lots breakdown */}
        <Card>
          <CardHeader><CardTitle>Lots</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total', value: Number(lotStats.total) },
                { label: 'For Sale', value: Number(lotStats.forSale) },
                { label: 'In Auction', value: Number(lotStats.inAuction) },
                { label: 'Sold', value: Number(lotStats.sold) },
                { label: 'Drafts', value: Number(lotStats.draft) },
                { label: 'Total Sold Value', value: fmt(Number(lotStats.totalValue)) },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xl font-semibold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Auctions breakdown */}
        <Card>
          <CardHeader><CardTitle>Auctions</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total', value: Number(auctionStats.total) },
                { label: 'Active', value: Number(auctionStats.active) },
                { label: 'Scheduled', value: Number(auctionStats.scheduled) },
                { label: 'Completed', value: Number(auctionStats.completed) },
                { label: 'Total Bids', value: Number(auctionStats.totalBids).toLocaleString() },
                { label: 'Registered Bidders', value: Number(auctionStats.totalBidders).toLocaleString() },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xl font-semibold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Users breakdown */}
        <Card>
          <CardHeader><CardTitle>Users</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total', value: Number(userStats.total) },
                { label: 'Buyers', value: Number(userStats.buyers) },
                { label: 'Sellers', value: Number(userStats.sellers) },
                { label: 'Admins', value: Number(userStats.admins) },
                { label: 'New This Week', value: Number(userStats.thisWeek) },
                { label: 'New This Month', value: Number(userStats.thisMonth) },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xl font-semibold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bidding stats */}
        <Card>
          <CardHeader><CardTitle>Bidding Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total Bids', value: Number(bidStats.total).toLocaleString() },
                { label: 'Bids Today', value: Number(bidStats.today) },
                { label: 'This Week', value: Number(bidStats.thisWeek) },
                { label: 'Unique Bidders', value: Number(bidStats.uniqueBidders) },
                { label: 'Avg Bid', value: fmt(Number(bidStats.avgAmount)) },
                { label: 'Highest Bid', value: fmt(Number(bidStats.maxAmount)) },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xl font-semibold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Consignments */}
        <Card>
          <CardHeader><CardTitle>Consignments</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total', value: Number(consignmentStats.total) },
                { label: 'Pending Review', value: Number(consignmentStats.submitted) },
                { label: 'Approved', value: Number(consignmentStats.approved) },
                { label: 'Listed', value: Number(consignmentStats.listed) },
                { label: 'Sold', value: Number(consignmentStats.sold) },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xl font-semibold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Outreach */}
        <Card>
          <CardHeader><CardTitle>Outreach CRM</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total Contacts', value: Number(outreachStats.total) },
                { label: 'New', value: Number(outreachStats.new) },
                { label: 'Interested', value: Number(outreachStats.interested) },
                { label: 'Converted', value: Number(outreachStats.converted) },
                { label: 'Needs Follow-Up', value: Number(outreachStats.needsFollowUp) },
                { label: 'Conversion Rate', value: `${conversionRate}%` },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xl font-semibold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top departments & recent bids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Top Departments</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(topCategories as unknown as { name: string; lot_count: number; sold_count: number; revenue: number }[]).map((cat) => (
                <div key={cat.name} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">{Number(cat.lot_count)} lots, {Number(cat.sold_count)} sold</p>
                  </div>
                  <span className="text-sm font-medium">{fmt(Number(cat.revenue))}</span>
                </div>
              ))}
              {(topCategories as unknown[]).length === 0 && (
                <p className="text-sm text-muted-foreground">No department data yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Bids</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(recentBids as unknown as { amount: number; created_at: string; lot_title: string; bidder_name: string }[]).map((bid, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium truncate max-w-[200px]">{bid.lot_title}</p>
                    <p className="text-xs text-muted-foreground">{bid.bidder_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{fmt(Number(bid.amount))}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(bid.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
              {(recentBids as unknown[]).length === 0 && (
                <p className="text-sm text-muted-foreground">No bids yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
