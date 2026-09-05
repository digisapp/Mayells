/**
 * Canonical public path for a lot. Gallery / private-treaty lots live under
 * /gallery, auction lots under /lots. Shared so emails, APIs, JSON-LD and the
 * sitemap can't drift apart (the old `/browse/...` links pointed at a route
 * group, which is not a URL segment, and 404ed).
 */
export function publicLotPath(lot: { slug?: string | null; id: string; saleType: string }): string {
  const ref = lot.slug || lot.id;
  return lot.saleType === 'gallery' || lot.saleType === 'private'
    ? `/gallery/${ref}`
    : `/lots/${ref}`;
}
