/**
 * Canonical public path for a lot. Gallery / private-treaty lots live under
 * /gallery, auction lots under /lots. Shared so emails, APIs, JSON-LD and the
 * sitemap can't drift apart (the old `/browse/...` links pointed at a route
 * group, which is not a URL segment, and 404ed).
 */
export function publicLotPath(lot: {
  slug?: string | null;
  id: string;
  saleType: string;
  /** When known (see bestAuctionSlugSql), links straight to the canonical lot page. */
  auctionSlug?: string | null;
}): string {
  const ref = lot.slug || lot.id;
  if (lot.saleType === 'gallery' || lot.saleType === 'private') return `/gallery/${ref}`;
  // /lots/{ref} resolves the sale and redirects: fine for emails and old
  // links, but a wasted hop (and a soft 200 for crawlers) when we know it.
  return lot.auctionSlug ? `/auctions/${lot.auctionSlug}/lots/${ref}` : `/lots/${ref}`;
}
