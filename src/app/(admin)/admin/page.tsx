export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { lots, auctions, users, outreachContacts } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gavel, Image, Users, FileText, Package, BarChart3, Mail, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default async function AdminDashboardPage() {
  const [lotCount] = await db.select({ count: sql<number>`count(*)` }).from(lots);
  const [auctionCount] = await db.select({ count: sql<number>`count(*)` }).from(auctions);
  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [activeLots] = await db.select({ count: sql<number>`count(*) filter (where ${lots.status} in ('for_sale', 'in_auction'))` }).from(lots);
  const [activeAuctions] = await db.select({ count: sql<number>`count(*) filter (where ${auctions.status} in ('open', 'live', 'preview'))` }).from(auctions);
  const [outreachCount] = await db.select({ count: sql<number>`count(*)` }).from(outreachContacts);
  const [outreachFollowUp] = await db.select({ count: sql<number>`count(*) filter (where ${outreachContacts.status} in ('new', 'follow_up'))` }).from(outreachContacts);

  const stats = [
    { label: 'Total Lots', value: Number(lotCount.count) },
    { label: 'Active Lots', value: Number(activeLots.count) },
    { label: 'Total Auctions', value: Number(auctionCount.count) },
    { label: 'Active Auctions', value: Number(activeAuctions.count) },
    { label: 'Users', value: Number(userCount.count) },
    { label: 'Outreach Leads', value: Number(outreachCount.count) },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-display-sm">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage auctions, lots, and users</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/auctions/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Auction
            </Button>
          </Link>
          <Link href="/admin/lots/new">
            <Button variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              New Lot
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <p className="text-2xl font-semibold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { href: '/admin/auctions', label: 'Auctions', icon: Gavel, desc: 'Create and manage auction events' },
          { href: '/admin/lots', label: 'Lots', icon: Image, desc: 'Manage lots and catalog items' },
          { href: '/admin/consignments', label: 'Consignments', icon: Package, desc: 'Review consignment submissions' },
          { href: '/admin/users', label: 'Users', icon: Users, desc: 'Manage buyer and seller accounts' },
          { href: '/admin/invoices', label: 'Invoices', icon: FileText, desc: 'View and manage invoices' },
          { href: '/admin/outreach', label: 'Outreach', icon: Mail, desc: `Marketing leads & follow-ups (${Number(outreachFollowUp.count)} need attention)` },
          { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, desc: 'Platform analytics and reports' },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:border-champagne/50 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <item.icon className="h-5 w-5 text-champagne" />
              </CardHeader>
              <CardContent>
                <CardTitle className="text-base">{item.label}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
