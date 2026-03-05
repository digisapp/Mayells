export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { lots, auctions, users, invoices } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function formatCurrency(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default async function AdminAnalyticsPage() {
  const [lotStats] = await db
    .select({
      total: sql<number>`count(*)`,
      sold: sql<number>`count(*) filter (where ${lots.status} = 'sold')`,
      forSale: sql<number>`count(*) filter (where ${lots.status} = 'for_sale')`,
      inAuction: sql<number>`count(*) filter (where ${lots.status} = 'in_auction')`,
      draft: sql<number>`count(*) filter (where ${lots.status} = 'draft')`,
    })
    .from(lots);

  const [auctionStats] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${auctions.status} in ('open', 'live', 'preview'))`,
      completed: sql<number>`count(*) filter (where ${auctions.status} = 'completed')`,
      scheduled: sql<number>`count(*) filter (where ${auctions.status} = 'scheduled')`,
    })
    .from(auctions);

  const [userStats] = await db
    .select({
      total: sql<number>`count(*)`,
      buyers: sql<number>`count(*) filter (where ${users.role} = 'buyer')`,
      sellers: sql<number>`count(*) filter (where ${users.role} = 'seller')`,
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')`,
    })
    .from(users);

  const [revenueStats] = await db
    .select({
      total: sql<number>`coalesce(sum(${invoices.totalAmount}), 0)`,
      paid: sql<number>`coalesce(sum(${invoices.totalAmount}) filter (where ${invoices.status} = 'paid'), 0)`,
      pending: sql<number>`coalesce(sum(${invoices.totalAmount}) filter (where ${invoices.status} = 'pending'), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(invoices);

  const stats = [
    {
      title: 'Lots',
      items: [
        { label: 'Total', value: lotStats.total },
        { label: 'Sold', value: lotStats.sold },
        { label: 'For Sale', value: lotStats.forSale },
        { label: 'In Auction', value: lotStats.inAuction },
        { label: 'Draft', value: lotStats.draft },
      ],
    },
    {
      title: 'Auctions',
      items: [
        { label: 'Total', value: auctionStats.total },
        { label: 'Active', value: auctionStats.active },
        { label: 'Scheduled', value: auctionStats.scheduled },
        { label: 'Completed', value: auctionStats.completed },
      ],
    },
    {
      title: 'Users',
      items: [
        { label: 'Total', value: userStats.total },
        { label: 'Buyers', value: userStats.buyers },
        { label: 'Sellers', value: userStats.sellers },
        { label: 'Admins', value: userStats.admins },
      ],
    },
    {
      title: 'Revenue',
      items: [
        { label: 'Total', value: formatCurrency(Number(revenueStats.total)) },
        { label: 'Paid', value: formatCurrency(Number(revenueStats.paid)) },
        { label: 'Pending', value: formatCurrency(Number(revenueStats.pending)) },
        { label: 'Invoices', value: revenueStats.count },
      ],
    },
  ];

  return (
    <div>
      <h1 className="font-display text-display-sm mb-8">Analytics</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {stats.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {group.items.map((item) => (
                  <div key={item.label}>
                    <p className="text-2xl font-semibold">{item.value}</p>
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
