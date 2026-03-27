export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { lots, auctions, users, outreachContacts, consignments, estateVisits } from '@/db/schema';
import { sql, desc, eq } from 'drizzle-orm';
import {
  Gavel, Image, Users as UsersIcon, FileText, Package, BarChart3,
  Mail, Plus, ClipboardCheck, Brain, Camera,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  submitted: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  draft: 'bg-gray-100 text-gray-700',
  processing: 'bg-yellow-100 text-yellow-700',
  review: 'bg-orange-100 text-orange-700',
  sent: 'bg-green-100 text-green-700',
};

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || profile.role !== 'admin') redirect('/admin/login');
  return profile;
}

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [
    [lotCount],
    [auctionCount],
    [userCount],
    [activeLots],
    [activeAuctions],
    [outreachCount],
    [outreachFollowUp],
    [appraisalCount],
    [appraisalReview],
    recentConsignments,
    recentAppraisals,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(lots),
    db.select({ count: sql<number>`count(*)` }).from(auctions),
    db.select({ count: sql<number>`count(*)` }).from(users),
    db.select({ count: sql<number>`count(*) filter (where ${lots.status} in ('for_sale', 'in_auction'))` }).from(lots),
    db.select({ count: sql<number>`count(*) filter (where ${auctions.status} in ('open', 'live', 'preview'))` }).from(auctions),
    db.select({ count: sql<number>`count(*)` }).from(outreachContacts),
    db.select({ count: sql<number>`count(*) filter (where ${outreachContacts.status} in ('new', 'follow_up'))` }).from(outreachContacts),
    db.select({ count: sql<number>`count(*)` }).from(estateVisits),
    db.select({ count: sql<number>`count(*) filter (where ${estateVisits.status} = 'review')` }).from(estateVisits),
    db.select({
      id: consignments.id,
      title: consignments.title,
      status: consignments.status,
      createdAt: consignments.createdAt,
    }).from(consignments).orderBy(desc(consignments.createdAt)).limit(5),
    db.select({
      id: estateVisits.id,
      clientName: estateVisits.clientName,
      itemCount: estateVisits.itemCount,
      status: estateVisits.status,
      createdAt: estateVisits.createdAt,
    }).from(estateVisits).orderBy(desc(estateVisits.createdAt)).limit(5),
  ]);

  const stats = [
    { label: 'Total Lots', value: Number(lotCount.count) },
    { label: 'Active Lots', value: Number(activeLots.count) },
    { label: 'Total Auctions', value: Number(auctionCount.count) },
    { label: 'Active Auctions', value: Number(activeAuctions.count) },
    { label: 'Users', value: Number(userCount.count) },
    { label: 'Appraisals', value: Number(appraisalCount.count) },
    { label: 'Outreach Leads', value: Number(outreachCount.count) },
  ];

  const appraisalReviewCount = Number(appraisalReview.count);
  const outreachFollowUpCount = Number(outreachFollowUp.count);

  const quickLinks = [
    { href: '/admin/auctions', label: 'Auctions', icon: Gavel, desc: 'Create and manage auctions' },
    { href: '/admin/lots', label: 'Lots', icon: Image, desc: 'Manage lots and catalog' },
    { href: '/admin/consignments', label: 'Consignments', icon: Package, desc: 'Review consignment submissions' },
    { href: '/admin/appraisals', label: 'Appraisals', icon: ClipboardCheck, desc: `Estate appraisals (${appraisalReviewCount} need review)` },
    { href: '/admin/outreach', label: 'Outreach', icon: Mail, desc: `Leads & follow-ups (${outreachFollowUpCount} pending)` },
    { href: '/admin/users', label: 'Users', icon: UsersIcon, desc: 'Manage accounts' },
    { href: '/admin/ai', label: 'AI Tools', icon: Brain, desc: 'Catalog, appraise, authenticate' },
    { href: '/admin/submissions', label: 'Submissions', icon: Camera, desc: 'Consignment/appraisal photos' },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, desc: 'Reports and insights' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-display-sm">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage auctions, lots, and consignments</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/auctions/new">
            <Button className="gap-2"><Plus className="h-4 w-4" />New Auction</Button>
          </Link>
          <Link href="/admin/lots/new">
            <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />New Lot</Button>
          </Link>
          <Link href="/admin/appraisals/new">
            <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />New Appraisal</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <p className="text-2xl font-semibold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {quickLinks.map((item) => (
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Consignments</CardTitle>
              <Link href="/admin/consignments" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentConsignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No consignments yet</p>
            ) : (
              <div className="space-y-3">
                {recentConsignments.map((c) => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">{c.title || 'Untitled'}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <Badge className={statusColors[c.status] || 'bg-gray-100 text-gray-700'}>
                      {c.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Appraisals</CardTitle>
              <Link href="/admin/appraisals" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentAppraisals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No appraisals yet</p>
            ) : (
              <div className="space-y-3">
                {recentAppraisals.map((a) => (
                  <Link key={a.id} href={`/admin/appraisals/${a.id}`} className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium group-hover:underline">{a.clientName}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.itemCount} items · {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <Badge className={statusColors[a.status] || 'bg-gray-100 text-gray-700'}>
                      {a.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
