export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { getAdminBadges, type AdminBadges } from '@/lib/admin/badges';
import { db } from '@/db';
import { auctions, bids, lots, users, invoices, sellerProspects, estateVisits } from '@/db/schema';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { formatCurrency, formatCurrencyWithCents } from '@/types';
import { getMicrositeRows } from '@/lib/admin/microsite-stats';
import { micrositeCity } from '@/lib/microsites/labels';
import {
  Plus, Inbox, Image as ImageIcon, UserPlus, ClipboardCheck, FileText, Banknote, Truck,
  Webhook, Mail, AlertTriangle, CheckCircle2, Gavel, ArrowRight, type LucideIcon,
} from 'lucide-react';

const auctionStatusColors: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  preview: 'bg-indigo-100 text-indigo-800',
  open: 'bg-green-100 text-green-800',
  live: 'bg-red-100 text-red-800',
  closing: 'bg-orange-100 text-orange-800',
  closed: 'bg-orange-100 text-orange-800',
};

const prospectStatusLabels: Record<string, string> = {
  new: 'New lead',
  contacted: 'Contacted',
  upload_sent: 'Upload link sent',
  items_received: 'Items received',
  under_review: 'Under review',
  agreement_sent: 'Agreement sent',
  agreement_signed: 'Agreement signed',
  accepted: 'Accepted',
  declined: 'Declined',
  archived: 'Archived',
};

const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/New_York',
});
const dateOnly = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' });

function relative(d: Date | null) {
  if (!d) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return dateOnly.format(d);
}

interface QueueItem {
  key: string;
  icon: LucideIcon;
  count: number;
  label: string;
  detail?: string;
  href: string;
  tone: 'attention' | 'problem' | 'info';
}

function buildQueue(b: AdminBadges): QueueItem[] {
  const items: QueueItem[] = [
    { key: 'inbox', icon: Inbox, count: b.inbox.unread, label: 'unread emails', detail: b.inbox.autoReplied ? `${b.inbox.autoReplied} answered by AI — review` : undefined, href: '/admin/emails', tone: 'attention' },
    { key: 'overdue', icon: FileText, count: b.invoices.overdue, label: 'overdue invoices', detail: b.invoices.overdueCents ? `${formatCurrency(b.invoices.overdueCents)} outstanding` : undefined, href: '/admin/invoices?status=overdue', tone: 'problem' },
    { key: 'webhooks', icon: Webhook, count: b.webhooks.failed24h, label: 'failed webhooks (24h)', detail: 'Payments or email may be stuck', href: '/admin/webhooks?status=failed', tone: 'problem' },
    { key: 'exception', icon: Truck, count: b.shipments.exception, label: 'shipments with problems', href: '/admin/shipments?status=exception', tone: 'problem' },
    { key: 'settling', icon: Gavel, count: b.auctions.settling, label: 'sales settling', detail: 'Invoices are being generated', href: '/admin/auctions?status=settling', tone: 'info' },
    { key: 'review', icon: ImageIcon, count: b.lots.pendingReview, label: 'lots awaiting review', href: '/admin/lots?status=pending_review', tone: 'attention' },
    { key: 'signed', icon: UserPlus, count: b.prospects.signed, label: 'signed agreements — create lots', href: '/admin/prospects?status=agreement_signed', tone: 'attention' },
    { key: 'prospects', icon: UserPlus, count: b.prospects.awaiting, label: 'prospects awaiting action', detail: 'New leads and items to review', href: '/admin/prospects?status=items_received', tone: 'attention' },
    { key: 'appraisals', icon: ClipboardCheck, count: b.appraisals.review, label: 'appraisals to review', href: '/admin/appraisals?status=review', tone: 'attention' },
    { key: 'payouts', icon: Banknote, count: b.payouts.pending, label: 'consignor payouts due', detail: b.payouts.pendingCents ? `${formatCurrency(b.payouts.pendingCents)} owed` : undefined, href: '/admin/payouts?status=pending', tone: 'attention' },
    { key: 'ship', icon: Truck, count: b.shipments.toShip, label: 'shipments to send', href: '/admin/shipments?status=pending', tone: 'attention' },
    { key: 'seller', icon: AlertTriangle, count: b.lots.missingSeller, label: 'lots with no consignor set', detail: 'Payouts are skipped for these', href: '/admin/lots?missingSeller=1', tone: 'attention' },
    { key: 'outreach', icon: Mail, count: b.outreach.due, label: 'outreach follow-ups due', href: '/admin/outreach?due=1', tone: 'info' },
  ];
  return items.filter((i) => i.count > 0);
}

export default async function AdminDashboardPage() {
  await requireAdminPage();

  const [badges, salesInMotion, latestBids, recentlyPaid, latestProspects, latestAppraisals, microsites] = await Promise.all([
    getAdminBadges(),
    db
      .select({
        id: auctions.id,
        title: auctions.title,
        status: auctions.status,
        type: auctions.type,
        lotCount: auctions.lotCount,
        biddingStartsAt: auctions.biddingStartsAt,
        biddingEndsAt: auctions.biddingEndsAt,
        bidCount: sql<number>`(select count(*) from bids b where b.auction_id = ${auctions.id})::int`,
      })
      .from(auctions)
      .where(inArray(auctions.status, ['scheduled', 'preview', 'open', 'live', 'closing', 'closed']))
      .orderBy(sql`case ${auctions.status} when 'live' then 0 when 'open' then 1 when 'closing' then 2 when 'closed' then 2 else 3 end`, auctions.biddingStartsAt)
      .limit(8),
    db
      .select({
        id: bids.id,
        amount: bids.amount,
        createdAt: bids.createdAt,
        lotId: lots.id,
        lotTitle: lots.title,
        paddle: users.paddleNumber,
        bidderName: sql<string | null>`coalesce(${users.fullName}, ${users.displayName}, ${users.email})`,
      })
      .from(bids)
      .innerJoin(lots, eq(lots.id, bids.lotId))
      .innerJoin(users, eq(users.id, bids.bidderId))
      .orderBy(desc(bids.createdAt))
      .limit(8),
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        totalAmount: invoices.totalAmount,
        paidAt: invoices.paidAt,
        lotTitle: lots.title,
        buyerName: sql<string | null>`coalesce(${users.fullName}, ${users.displayName}, ${users.email})`,
      })
      .from(invoices)
      .innerJoin(lots, eq(lots.id, invoices.lotId))
      .innerJoin(users, eq(users.id, invoices.buyerId))
      .where(eq(invoices.status, 'paid'))
      .orderBy(desc(invoices.paidAt))
      .limit(5),
    db
      .select({
        id: sellerProspects.id,
        fullName: sellerProspects.fullName,
        status: sellerProspects.status,
        source: sellerProspects.source,
        site: sellerProspects.site,
        totalItems: sellerProspects.totalItems,
        createdAt: sellerProspects.createdAt,
      })
      .from(sellerProspects)
      .orderBy(desc(sellerProspects.createdAt))
      .limit(5),
    db
      .select({
        id: estateVisits.id,
        clientName: estateVisits.clientName,
        itemCount: estateVisits.itemCount,
        status: estateVisits.status,
        createdAt: estateVisits.createdAt,
      })
      .from(estateVisits)
      .orderBy(desc(estateVisits.createdAt))
      .limit(5),
    getMicrositeRows(30),
  ]);

  const queue = buildQueue(badges);
  const problems = queue.filter((q) => q.tone === 'problem');
  const todo = queue.filter((q) => q.tone !== 'problem');

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-sm">Dashboard</h1>
          <p className="text-muted-foreground mt-1">{dateOnly.format(new Date())} · what needs you today</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="gap-2">
            <Link href="/admin/lots/new"><Plus className="h-4 w-4" />New lot</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/admin/auctions/new"><Plus className="h-4 w-4" />New auction</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/admin/appraisals/new"><Plus className="h-4 w-4" />New appraisal</Link>
          </Button>
        </div>
      </div>

      {/* Action queue */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Action queue</h2>
          {queue.length > 0 && <span className="text-xs text-muted-foreground">{queue.length} {queue.length === 1 ? 'item' : 'items'}</span>}
        </div>
        {queue.length === 0 ? (
          <Card>
            <CardContent className="py-8 flex items-center gap-3 text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              All clear — nothing is waiting on you.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {[...problems, ...todo].map((item) => (
              <Link key={item.key} href={item.href} className="group">
                <Card className={item.tone === 'problem' ? 'border-red-200 hover:border-red-300 transition-colors h-full' : 'hover:border-champagne/60 transition-colors h-full'}>
                  <CardContent className="py-4 flex items-start gap-3">
                    <div className={item.tone === 'problem' ? 'p-2 rounded-md bg-red-50 text-red-600' : 'p-2 rounded-md bg-champagne/20 text-charcoal'}>
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold leading-tight tabular-nums">
                        {item.count} <span className="text-sm font-normal text-foreground">{item.label}</span>
                      </p>
                      {item.detail && <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales in motion */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Sales in motion</CardTitle>
            <Link href="/admin/auctions" className="text-xs text-muted-foreground hover:text-foreground">All auctions</Link>
          </CardHeader>
          <CardContent>
            {salesInMotion.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled or open sales. <Link href="/admin/auctions/new" className="underline">Create one</Link>.</p>
            ) : (
              <div className="divide-y">
                {salesInMotion.map((a) => {
                  const settling = a.status === 'closing' || a.status === 'closed';
                  return (
                    <div key={a.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/auctions/${a.id}`} className="font-medium text-sm hover:underline truncate block">{a.title}</Link>
                        <p className="text-xs text-muted-foreground">
                          {a.lotCount} lots · {a.bidCount} bids ·{' '}
                          {a.status === 'scheduled' || a.status === 'preview'
                            ? `opens ${a.biddingStartsAt ? dateTime.format(a.biddingStartsAt) : 'TBD'}`
                            : a.biddingEndsAt
                              ? `closes ${dateTime.format(a.biddingEndsAt)}`
                              : a.type === 'live' ? 'auctioneer-led' : 'no close time'}
                        </p>
                      </div>
                      <Badge className={auctionStatusColors[a.status] ?? ''}>{settling ? 'settling' : a.status}</Badge>
                      {settling ? (
                        <Link href={`/admin/auctions/${a.id}/settlement`} className="text-xs underline text-muted-foreground hover:text-foreground">Settlement</Link>
                      ) : a.status === 'live' ? (
                        <Link href={`/admin/live/${a.id}`} className="text-xs underline text-red-600">Console</Link>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Latest bids */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Latest bids</CardTitle>
            <Link href="/admin/analytics" className="text-xs text-muted-foreground hover:text-foreground">Analytics</Link>
          </CardHeader>
          <CardContent>
            {latestBids.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bids yet.</p>
            ) : (
              <div className="space-y-3">
                {latestBids.map((b) => (
                  <div key={b.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <Link href={`/admin/lots/${b.lotId}`} className="hover:underline truncate block">{b.lotTitle}</Link>
                      <p className="text-xs text-muted-foreground truncate">
                        {b.paddle ? `Paddle ${b.paddle}` : b.bidderName} · {relative(b.createdAt)}
                      </p>
                    </div>
                    <span className="font-medium tabular-nums shrink-0">{formatCurrency(b.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* City microsites */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>City microsites · last 30 days</CardTitle>
          <Link href="/admin/microsites" className="text-xs text-muted-foreground hover:text-foreground">Details</Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {microsites.map((m) => (
              <Link key={m.slug} href="/admin/microsites" className="rounded-md border p-3 hover:border-champagne/60 transition-colors">
                <p className="text-sm font-medium truncate">{m.city}</p>
                <p className="text-[11px] text-muted-foreground truncate">{m.domain}</p>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <div>
                    <p className="text-base font-semibold tabular-nums">{m.visitors}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Visitors</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold tabular-nums">{m.calls}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Calls</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold tabular-nums">{m.leads}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Leads</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>New prospects</CardTitle>
            <Link href="/admin/prospects" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
          </CardHeader>
          <CardContent>
            {latestProspects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No prospects yet.</p>
            ) : (
              <div className="space-y-3">
                {latestProspects.map((p) => (
                  <Link key={p.id} href={`/admin/prospects/${p.id}`} className="flex items-center justify-between gap-3 group">
                    <div className="min-w-0">
                      <p className="text-sm font-medium group-hover:underline truncate">{p.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {prospectStatusLabels[p.status] ?? p.status}{p.totalItems ? ` · ${p.totalItems} items` : ''} · {relative(p.createdAt)}
                      </p>
                    </div>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">{p.site ? `${micrositeCity(p.site)} site` : p.source.replace('_', ' ')}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent appraisals</CardTitle>
            <Link href="/admin/appraisals" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
          </CardHeader>
          <CardContent>
            {latestAppraisals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No appraisals yet.</p>
            ) : (
              <div className="space-y-3">
                {latestAppraisals.map((a) => (
                  <Link key={a.id} href={`/admin/appraisals/${a.id}`} className="flex items-center justify-between gap-3 group">
                    <div className="min-w-0">
                      <p className="text-sm font-medium group-hover:underline truncate">{a.clientName}</p>
                      <p className="text-xs text-muted-foreground">{a.itemCount} items · {relative(a.createdAt)}</p>
                    </div>
                    <Badge variant={a.status === 'review' ? 'default' : 'secondary'} className="capitalize shrink-0">{a.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recently paid</CardTitle>
            <Link href="/admin/invoices?status=paid" className="text-xs text-muted-foreground hover:text-foreground">Invoices</Link>
          </CardHeader>
          <CardContent>
            {recentlyPaid.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <div className="space-y-3">
                {recentlyPaid.map((inv) => (
                  <div key={inv.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{inv.lotTitle}</p>
                      <p className="text-xs text-muted-foreground truncate">{inv.buyerName} · {inv.invoiceNumber} · {relative(inv.paidAt)}</p>
                    </div>
                    <span className="font-medium tabular-nums shrink-0">{formatCurrencyWithCents(inv.totalAmount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
