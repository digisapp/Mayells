import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { db } from '@/db';
import { users, lots, auctionLots, auctions, payouts } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { formatCurrency } from '@/types';
import { BUSINESS } from '@/lib/config';
import { isValidPortalToken, consignorStatusLabel, summarizeConsignor } from '@/lib/sellers/portal';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your Consignments | Mayells',
  robots: { index: false, follow: false },
};

function formatDate(d: Date | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default async function ConsignorPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isValidPortalToken(token)) notFound();

  const [seller] = await db
    .select({ id: users.id, fullName: users.fullName, displayName: users.displayName })
    .from(users)
    .where(eq(users.portalToken, token))
    .limit(1);
  if (!seller) notFound();

  const lotRows = await db
    .select({
      id: lots.id,
      title: lots.title,
      artist: lots.artist,
      status: lots.status,
      estimateLow: lots.estimateLow,
      estimateHigh: lots.estimateHigh,
      currentBidAmount: lots.currentBidAmount,
      bidCount: lots.bidCount,
      hammerPrice: lots.hammerPrice,
      primaryImageUrl: lots.primaryImageUrl,
      createdAt: lots.createdAt,
      auctionTitle: auctions.title,
      auctionEndsAt: auctions.biddingEndsAt,
    })
    .from(lots)
    .leftJoin(auctionLots, eq(auctionLots.lotId, lots.id))
    .leftJoin(auctions, eq(auctions.id, auctionLots.auctionId))
    .where(eq(lots.sellerId, seller.id))
    .orderBy(desc(lots.createdAt));

  // A lot can appear once per auction assignment — keep the first row per lot
  // so each item renders exactly once.
  const seen = new Set<string>();
  const sellerLots: typeof lotRows = [];
  for (const row of lotRows) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      sellerLots.push(row);
    }
  }

  const payoutRows = await db
    .select({
      id: payouts.id,
      lotId: payouts.lotId,
      hammerPrice: payouts.hammerPrice,
      commissionPercent: payouts.commissionPercent,
      commissionAmount: payouts.commissionAmount,
      netAmount: payouts.netAmount,
      status: payouts.status,
      paidAt: payouts.paidAt,
      method: payouts.method,
      lotTitle: lots.title,
    })
    .from(payouts)
    .innerJoin(lots, eq(lots.id, payouts.lotId))
    .where(eq(payouts.sellerId, seller.id))
    .orderBy(desc(payouts.createdAt));

  // Every user row has a token, but the portal only exists for sellers-of-
  // record. 404 for everyone else so the URL reveals nothing about buyers.
  if (sellerLots.length === 0 && payoutRows.length === 0) notFound();

  const activePayouts = payoutRows.filter((p) => p.status !== 'cancelled');
  const summary = summarizeConsignor(sellerLots, activePayouts);
  const name = seller.fullName || seller.displayName || 'Consignor';

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">
          Consignor Portal
        </p>
        <h1 className="font-display text-display-md mb-2">{name}</h1>
        <p className="text-muted-foreground">
          Follow your items from cataloging through sale and payment — this page is always up to date.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
        <div className="text-center border rounded-xl p-5">
          <p className="text-3xl font-display">{summary.totalItems}</p>
          <p className="text-sm text-muted-foreground mt-1">Items Consigned</p>
        </div>
        <div className="text-center border rounded-xl p-5">
          <p className="text-3xl font-display">{summary.soldItems}</p>
          <p className="text-sm text-muted-foreground mt-1">Sold</p>
        </div>
        <div className="text-center border rounded-xl p-5">
          <p className="text-xl font-display">{formatCurrency(summary.pendingNet)}</p>
          <p className="text-sm text-muted-foreground mt-1">Proceeds Pending</p>
        </div>
        <div className="text-center border rounded-xl p-5">
          <p className="text-xl font-display text-champagne">{formatCurrency(summary.paidNet)}</p>
          <p className="text-sm text-muted-foreground mt-1">Proceeds Paid</p>
        </div>
      </div>

      {/* Items */}
      <h2 className="font-display text-display-sm mb-6">Your Items</h2>
      <div className="space-y-6 mb-16">
        {sellerLots.map((lot) => (
          <div key={lot.id} className="border rounded-xl overflow-hidden">
            <div className="grid sm:grid-cols-[200px_1fr]">
              <div className="relative aspect-square sm:aspect-auto sm:h-full bg-muted">
                {lot.primaryImageUrl && (
                  <Image
                    src={lot.primaryImageUrl}
                    alt={lot.title}
                    fill
                    sizes="(max-width: 640px) 100vw, 200px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <h3 className="font-display text-lg">{lot.title}</h3>
                    {lot.artist && <p className="text-sm text-muted-foreground">{lot.artist}</p>}
                  </div>
                  <span className="shrink-0 text-xs uppercase tracking-wider border rounded-full px-3 py-1 text-muted-foreground">
                    {consignorStatusLabel(lot.status)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground mt-3">
                  {lot.estimateLow != null && lot.estimateHigh != null && (
                    <span>
                      Estimate: {formatCurrency(lot.estimateLow)} – {formatCurrency(lot.estimateHigh)}
                    </span>
                  )}
                  {lot.auctionTitle && lot.status !== 'sold' && (
                    <span>
                      {lot.auctionTitle}
                      {lot.auctionEndsAt ? ` · ends ${formatDate(lot.auctionEndsAt)}` : ''}
                    </span>
                  )}
                  {lot.status === 'in_auction' && lot.bidCount > 0 && (
                    <span className="text-foreground">
                      Current bid: {formatCurrency(lot.currentBidAmount)} ({lot.bidCount} bid{lot.bidCount === 1 ? '' : 's'})
                    </span>
                  )}
                  {lot.status === 'sold' && lot.hammerPrice != null && (
                    <span className="text-foreground font-medium">
                      Hammer price: {formatCurrency(lot.hammerPrice)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Payouts */}
      {activePayouts.length > 0 && (
        <>
          <h2 className="font-display text-display-sm mb-6">Settlements</h2>
          <div className="border rounded-xl overflow-x-auto mb-16">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-normal">Item</th>
                  <th className="p-4 font-normal text-right">Hammer</th>
                  <th className="p-4 font-normal text-right">Commission</th>
                  <th className="p-4 font-normal text-right">Net to You</th>
                  <th className="p-4 font-normal text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {activePayouts.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0">
                    <td className="p-4">{p.lotTitle}</td>
                    <td className="p-4 text-right">{formatCurrency(p.hammerPrice)}</td>
                    <td className="p-4 text-right text-muted-foreground">
                      −{formatCurrency(p.commissionAmount)} ({p.commissionPercent}%)
                    </td>
                    <td className="p-4 text-right font-medium">{formatCurrency(p.netAmount)}</td>
                    <td className="p-4 text-right">
                      {p.status === 'paid'
                        ? `Paid${p.paidAt ? ` ${formatDate(p.paidAt)}` : ''}`
                        : 'Payment on the way'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Contact */}
      <div className="text-center text-sm text-muted-foreground">
        <p className="mb-1">Questions about your consignment?</p>
        <p>
          Call{' '}
          <a href={BUSINESS.phoneHref} className="text-foreground hover:underline">
            {BUSINESS.phone}
          </a>{' '}
          or email{' '}
          <a href={`mailto:${BUSINESS.email}`} className="text-foreground hover:underline">
            {BUSINESS.email}
          </a>
        </p>
      </div>
    </div>
  );
}
