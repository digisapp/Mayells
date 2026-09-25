import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/types';
import type { Lot } from '@/db/schema/lots';

/**
 * The public fields a card renders. Callers may pass a full lot row; the /lots
 * browser passes just this subset so the client payload stays small (and never
 * carries a confidential column).
 */
export type LotCardLot = Pick<
  Lot,
  | 'id'
  | 'slug'
  | 'title'
  | 'artist'
  | 'lotNumber'
  | 'primaryImageUrl'
  | 'isFeatured'
  | 'saleType'
  | 'status'
  | 'buyNowPrice'
  | 'estimateLow'
  | 'estimateHigh'
  | 'currentBidAmount'
  | 'bidCount'
> & {
  /** The lot's resolved auction slug (see bestAuctionSlugSql). */
  auctionSlug?: string | null;
};

interface LotCardProps {
  lot: LotCardLot;
  auctionSlug?: string;
  showBidInfo?: boolean;
  isGallery?: boolean;
  /** First row of a grid: load the image straight away, since it is likely the LCP. */
  eager?: boolean;
}

/**
 * Catalogue style ("$35,000–50,000", one currency sign) so a six-figure range
 * still fits one line of a 2-up phone card at a readable 12px.
 */
function formatEstimate(low: number, high: number) {
  return (
    <>
      <span className="whitespace-nowrap">{formatCurrency(low)}</span>–
      <span className="whitespace-nowrap">{formatCurrency(high).replace('$', '')}</span>
    </>
  );
}

export function LotCard({ lot, auctionSlug, showBidInfo = true, isGallery, eager }: LotCardProps) {
  const galleryMode = isGallery || lot.saleType === 'gallery' || lot.saleType === 'private';
  // Prefer a known auction slug (grid-level or per-lot) so the card links
  // straight to the canonical URL; /lots/{slug} is a resolver+redirect hop.
  const resolvedAuctionSlug = auctionSlug ?? lot.auctionSlug ?? null;
  const href = galleryMode
    ? `/gallery/${lot.slug || lot.id}`
    : resolvedAuctionSlug
      ? `/auctions/${resolvedAuctionSlug}/lots/${lot.slug || lot.id}`
      : `/lots/${lot.slug || lot.id}`;

  return (
    <Link
      href={href}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="rounded-xl overflow-hidden bg-card border border-border/70 transition-all duration-300 hover:border-champagne/40 hover:shadow-luxury">
        <div className="relative aspect-[3/4] bg-muted overflow-hidden">
          {lot.primaryImageUrl ? (
            <Image
              src={lot.primaryImageUrl}
              alt={lot.title}
              fill
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
              sizes="(max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
              loading={eager ? 'eager' : undefined}
              fetchPriority={eager ? 'high' : undefined}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center">
              <span className="font-logo text-lg text-muted-foreground/40">MAYELLS</span>
            </div>
          )}

          {lot.isFeatured && (
            <Badge className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 bg-champagne text-charcoal text-[11px] uppercase tracking-wider font-semibold border-0 shadow-sm">
              Featured
            </Badge>
          )}
        </div>

        <div className="p-3 sm:p-4 space-y-1 sm:space-y-1.5">
          {lot.lotNumber && (
            <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Lot {lot.lotNumber}
            </span>
          )}
          <h3 className="font-display text-[13px] sm:text-[15px] leading-snug group-hover:text-champagne transition-colors duration-300 line-clamp-2">
            {lot.title}
          </h3>
          {lot.artist && (
            <p className="text-[12px] sm:text-sm text-muted-foreground line-clamp-1">{lot.artist}</p>
          )}

          {/* Small tracked caps use champagne-deep: plain champagne is ~2:1 on white. */}
          {lot.saleType === 'private' && !lot.buyNowPrice ? (
            <div className="pt-1.5 sm:pt-2 border-t border-border/50 mt-1.5 sm:mt-2">
              <p className="text-[11px] text-champagne-deep font-semibold uppercase tracking-wider">
                Inquire for Price
              </p>
            </div>
          ) : galleryMode && lot.buyNowPrice ? (
            <div className="pt-1.5 sm:pt-2 border-t border-border/50 mt-1.5 sm:mt-2">
              <p className="text-[13px] sm:text-sm font-semibold tracking-tight">
                {formatCurrency(lot.buyNowPrice)}
              </p>
              <p className="text-[11px] text-champagne-deep font-semibold uppercase tracking-wider">
                Buy Now
              </p>
            </div>
          ) : showBidInfo && lot.status === 'in_auction' && lot.currentBidAmount > 0 ? (
            <div className="pt-1.5 sm:pt-2 border-t border-border/50 mt-1.5 sm:mt-2">
              <p className="text-[13px] sm:text-sm font-semibold tracking-tight">
                {formatCurrency(lot.currentBidAmount)}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {lot.bidCount} bid{lot.bidCount !== 1 ? 's' : ''}
              </p>
            </div>
          ) : (
            lot.estimateLow && lot.estimateHigh && (
              <p className="text-[12px] sm:text-[13px] text-muted-foreground pt-1.5 sm:pt-2 border-t border-border/50 mt-1.5 sm:mt-2">
                Est. {formatEstimate(lot.estimateLow, lot.estimateHigh)}
              </p>
            )
          )}
        </div>
      </div>
    </Link>
  );
}
