export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import { db } from '@/db';
import { lots, auctions, auctionLots } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

/**
 * Canonical resolver for a bare /lots/{id-or-slug} link.
 *
 * LotCard falls back to /lots/{slug} whenever it renders a lot without knowing
 * its auction slug (the /lots browse page, home "Featured Lots", category and
 * search results). There is no standalone lot detail page — a lot always lives
 * under its auction or in the gallery — so this route resolves the lot and
 * redirects to the real page instead of 404ing.
 */
export default async function LotRedirectPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const byId = UUID_RE.test(lotId);

  const [lot] = await db
    .select()
    .from(lots)
    .where(byId ? eq(lots.id, lotId) : eq(lots.slug, lotId))
    .limit(1);

  if (!lot) notFound();

  // Gallery / private-sale lots live in the gallery.
  if (lot.saleType === 'gallery' || lot.saleType === 'private') {
    redirect(`/gallery/${lot.slug || lot.id}`);
  }

  // Otherwise resolve the most relevant auction this lot belongs to, preferring
  // one that is live/open, then upcoming, then completed.
  const [row] = await db
    .select({ auctionSlug: auctions.slug })
    .from(auctionLots)
    .innerJoin(auctions, eq(auctions.id, auctionLots.auctionId))
    .where(eq(auctionLots.lotId, lot.id))
    .orderBy(
      sql`CASE ${auctions.status}
        WHEN 'live' THEN 0
        WHEN 'open' THEN 0
        WHEN 'preview' THEN 1
        WHEN 'scheduled' THEN 1
        WHEN 'closing' THEN 2
        WHEN 'closed' THEN 2
        ELSE 3 END`,
      desc(auctions.biddingEndsAt),
    )
    .limit(1);

  if (row?.auctionSlug) {
    redirect(`/auctions/${row.auctionSlug}/lots/${lot.slug || lot.id}`);
  }

  // A lot with no auction and not in the gallery has nowhere to display.
  notFound();
}
