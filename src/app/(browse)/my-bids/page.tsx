export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { bids, lots, maxBids, invoices, auctionLots } from '@/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { formatCurrency } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AuctionCountdown } from '@/components/auctions/AuctionCountdown';
import { AccountShell } from '@/components/account/AccountShell';
import { invoiceStatusBadge } from '@/components/account/invoice-status';
import { publicLotPath } from '@/lib/lots/urls';
import { Gavel, CheckCircle2, XCircle, Trophy } from 'lucide-react';

export const metadata: Metadata = {
  title: 'My Bids',
  robots: { index: false, follow: false },
};

interface Row {
  lotId: string;
  title: string;
  slug: string | null;
  saleType: string;
  primaryImageUrl: string | null;
  currentBidAmount: number;
  currentBidderId: string | null;
  status: string;
  winnerId: string | null;
  hammerPrice: number | null;
  /** Raw-SQL timestamps come back from the driver as strings. */
  closingAt: string | null;
  yourTopBid: number;
}

export default async function MyBidsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/my-bids');

  // One row per lot the bidder has ever bid on, with the lot's live state and
  // this bidder's highest bid on it.
  const rows = (await db
    .select({
      lotId: lots.id,
      title: lots.title,
      slug: lots.slug,
      saleType: lots.saleType,
      primaryImageUrl: lots.primaryImageUrl,
      currentBidAmount: lots.currentBidAmount,
      currentBidderId: lots.currentBidderId,
      status: lots.status,
      winnerId: lots.winnerId,
      hammerPrice: lots.hammerPrice,
      yourTopBid: sql<number>`max(${bids.amount})`,
      // closing_at is a UTC timestamp without zone: return it as ISO with "Z"
      // so new Date() reads it as UTC whatever the runtime's timezone.
      closingAt: sql<string | null>`to_char((
        SELECT closing_at FROM ${auctionLots}
        WHERE ${auctionLots.lotId} = ${lots.id}
        ORDER BY closing_at DESC NULLS LAST LIMIT 1
      ), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
    })
    .from(bids)
    .innerJoin(lots, eq(lots.id, bids.lotId))
    .where(eq(bids.bidderId, user.id))
    .groupBy(lots.id)
    .orderBy(sql`max(${bids.createdAt}) DESC`)) as Row[];

  const lotIds = rows.map((r) => r.lotId);

  // Bulk-load this bidder's proxy maxes and any invoices for won lots — no N+1.
  const [maxRows, invoiceRows] = lotIds.length
    ? await Promise.all([
        db
          .select({ lotId: maxBids.lotId, maxAmount: maxBids.maxAmount, isActive: maxBids.isActive })
          .from(maxBids)
          .where(and(eq(maxBids.bidderId, user.id), inArray(maxBids.lotId, lotIds))),
        db
          .select({
            lotId: invoices.lotId,
            accessToken: invoices.accessToken,
            status: invoices.status,
            totalAmount: invoices.totalAmount,
          })
          .from(invoices)
          .where(and(eq(invoices.buyerId, user.id), inArray(invoices.lotId, lotIds))),
      ])
    : [[], []];

  const maxByLot = new Map(maxRows.map((m) => [m.lotId, m]));
  const invoiceByLot = new Map(invoiceRows.map((i) => [i.lotId, i]));

  // Server renders once per request — authoritative time for the countdowns.
  const now = Date.now();
  const active: Row[] = [];
  const won: Row[] = [];
  const lost: Row[] = [];
  for (const r of rows) {
    if (r.status === 'in_auction') active.push(r);
    else if (r.winnerId === user.id) won.push(r);
    else lost.push(r);
  }

  const empty = rows.length === 0;

  return (
    <AccountShell active="my-bids" title="My Bids" icon={<Gavel className="h-6 w-6 text-champagne" />}>
      {empty ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground mb-5">You haven&apos;t placed any bids yet.</p>
          <Button asChild size="lg" variant="champagne">
            <Link href="/auctions">Browse auctions</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Active */}
          {active.length > 0 && (
            <section>
              <h2 className="font-display text-display-sm mb-5">Active ({active.length})</h2>
              <div className="space-y-3">
                {active.map((r) => {
                  const winning = r.currentBidderId === user.id;
                  const max = maxByLot.get(r.lotId);
                  // The status flips to sold/passed only when the lot is
                  // settled, which can trail its close; no close time (a live
                  // sale) means bidding is still open.
                  const closesAt = r.closingAt ? new Date(r.closingAt) : null;
                  const stillOpen = !closesAt || closesAt.getTime() > now;
                  return (
                    <BidRow key={r.lotId} r={r}>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                        <div>
                          <span className="text-muted-foreground">Current </span>
                          <span className="font-semibold">{formatCurrency(r.currentBidAmount)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Your bid </span>
                          <span className="font-medium">{formatCurrency(r.yourTopBid)}</span>
                        </div>
                        {max && max.isActive && (
                          <div className="text-muted-foreground">Max {formatCurrency(max.maxAmount)}</div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        {winning ? (
                          <Badge className="bg-green-600 text-white gap-1"><CheckCircle2 className="h-3 w-3" /> Winning</Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Outbid</Badge>
                        )}
                        {closesAt && stillOpen && (
                          <AuctionCountdown endsAt={closesAt} serverNow={now} variant="inline" className="text-sm" />
                        )}
                      </div>
                      {!winning && stillOpen && (
                        <Button asChild size="lg" variant="champagne" className="mt-3">
                          <Link href={publicLotPath({ id: r.lotId, slug: r.slug, saleType: r.saleType })}>Bid again</Link>
                        </Button>
                      )}
                    </BidRow>
                  );
                })}
              </div>
            </section>
          )}

          {/* Won */}
          {won.length > 0 && (
            <section>
              <h2 className="font-display text-display-sm mb-5 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-champagne" /> Won ({won.length})
              </h2>
              <div className="space-y-3">
                {won.map((r) => {
                  const invoice = invoiceByLot.get(r.lotId);
                  const unpaid = invoice && (invoice.status === 'pending' || invoice.status === 'overdue');
                  return (
                    <BidRow key={r.lotId} r={r}>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                        <div>
                          <span className="text-muted-foreground">Hammer </span>
                          <span className="font-semibold">{formatCurrency(r.hammerPrice ?? r.yourTopBid)}</span>
                        </div>
                        {invoice && (
                          <div>
                            <span className="text-muted-foreground">Invoice total </span>
                            <span className="font-medium">{formatCurrency(invoice.totalAmount)}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        {invoice ? (
                          unpaid ? (
                            <Button asChild size="lg" variant="champagne">
                              <Link href={`/invoices/${invoice.accessToken}`}>Pay invoice</Link>
                            </Button>
                          ) : (
                            <Badge className={invoiceStatusBadge(invoice.status).className}>
                              {invoiceStatusBadge(invoice.status).label}
                            </Badge>
                          )
                        ) : (
                          <Badge variant="secondary">Invoice pending</Badge>
                        )}
                      </div>
                    </BidRow>
                  );
                })}
              </div>
            </section>
          )}

          {/* Didn't win */}
          {lost.length > 0 && (
            <section>
              <h2 className="font-display text-display-sm mb-5 text-muted-foreground">Didn&apos;t win ({lost.length})</h2>
              <div className="space-y-3 opacity-75">
                {lost.map((r) => (
                  <BidRow key={r.lotId} r={r}>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                      <div>
                        <span className="text-muted-foreground">Sold for </span>
                        <span className="font-medium">
                          {r.hammerPrice ? formatCurrency(r.hammerPrice) : r.status === 'unsold' ? 'Unsold' : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Your bid </span>
                        <span>{formatCurrency(r.yourTopBid)}</span>
                      </div>
                    </div>
                  </BidRow>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AccountShell>
  );
}

function BidRow({ r, children }: { r: Row; children: React.ReactNode }) {
  const href = publicLotPath({ id: r.lotId, slug: r.slug, saleType: r.saleType });
  return (
    <div className="flex gap-4 border border-border/50 rounded-xl p-4">
      <Link href={href} className="relative w-20 h-20 rounded-lg overflow-hidden bg-muted shrink-0">
        {r.primaryImageUrl ? (
          <Image src={r.primaryImageUrl} alt={r.title} fill className="object-cover" sizes="80px" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No image</div>
        )}
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={href} className="font-display text-lg line-clamp-1 hover:text-champagne transition-colors">
          {r.title}
        </Link>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}
