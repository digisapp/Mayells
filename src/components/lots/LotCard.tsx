import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/types';
import { formatEstimate } from '@/lib/format/estimate';
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
  /** Shown as "Sold · $X" once the lot has sold; optional so subset callers can omit it. */
  hammerPrice?: Lot['hammerPrice'];
};

interface LotCardProps {
  lot: LotCardLot;
  auctionSlug?: string;
  showBidInfo?: boolean;
  isGallery?: boolean;
  /**
   * The lot number only means something inside one sale's catalogue. Lists
   * that mix sales (home, /lots, categories) pass false; gallery items never
   * show one.
   */
  showLotNumber?: boolean;
  /** First row of a grid: load the image straight away, since it is likely the LCP. */
  eager?: boolean;
}

// Small tracked caps use champagne-deep: plain champagne is ~2:1 on white.
const TAG = 'text-xs font-semibold uppercase tracking-wider';

export function LotCard({
  lot,
  auctionSlug,
  showBidInfo = true,
  isGallery,
  showLotNumber = true,
  eager,
}: LotCardProps) {
  const galleryMode = isGallery || lot.saleType === 'gallery' || lot.saleType === 'private';
  // Prefer a known auction slug (grid-level or per-lot) so the card links
  // straight to the canonical URL; /lots/{slug} is a resolver+redirect hop.
  const resolvedAuctionSlug = auctionSlug ?? lot.auctionSlug ?? null;
  const href = galleryMode
    ? `/gallery/${lot.slug || lot.id}`
    : resolvedAuctionSlug
      ? `/auctions/${resolvedAuctionSlug}/lots/${lot.slug || lot.id}`
      : `/lots/${lot.slug || lot.id}`;
  // Compact ("$35,000–50,000") and lower-cased after "Est." ("Est. up to $2,000").
  const estimate = formatEstimate(lot.estimateLow, lot.estimateHigh, { compact: true })?.replace(/^Up to/, 'up to');

  let footer: React.ReactNode = null;
  if (lot.status === 'sold') {
    footer = (
      <p className={`${TAG} text-foreground`}>
        Sold{lot.hammerPrice ? <> &middot; <span className="tabular-nums">{formatCurrency(lot.hammerPrice)}</span></> : null}
      </p>
    );
  } else if (lot.saleType === 'private' && !lot.buyNowPrice) {
    footer = <p className={`${TAG} text-champagne-deep`}>Inquire for Price</p>;
  } else if (galleryMode && lot.buyNowPrice) {
    footer = (
      <>
        <p className="text-[13px] sm:text-sm font-semibold tracking-tight">{formatCurrency(lot.buyNowPrice)}</p>
        <p className={`${TAG} text-champagne-deep`}>{lot.saleType === 'private' ? 'Private sale' : 'Fixed price'}</p>
      </>
    );
  } else if (showBidInfo && lot.status === 'in_auction' && lot.currentBidAmount > 0) {
    footer = (
      <>
        <p className="text-[13px] sm:text-sm font-semibold tracking-tight">{formatCurrency(lot.currentBidAmount)}</p>
        <p className="text-xs text-muted-foreground">
          {lot.bidCount} bid{lot.bidCount !== 1 ? 's' : ''}
        </p>
      </>
    );
  } else if (estimate) {
    // One line on a 2-up phone card: a range too wide truncates (the link's
    // accessible name still carries it whole) rather than breaking after the dash.
    footer = <p className="truncate text-xs sm:text-[13px] text-muted-foreground">Est. {estimate}</p>;
  }

  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex flex-1 flex-col rounded-xl overflow-hidden bg-card border border-border/70 transition-all duration-300 hover:border-champagne/40 hover:shadow-luxury">
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
            <Badge className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 bg-champagne text-charcoal text-xs uppercase tracking-wider font-semibold border-0 shadow-sm">
              Featured
            </Badge>
          )}
        </div>

        <div className="flex flex-1 flex-col p-3 sm:p-4">
          <div className="space-y-1 sm:space-y-1.5">
            {showLotNumber && !galleryMode && lot.lotNumber && (
              <span className="block text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Lot {lot.lotNumber}
              </span>
            )}
            <h3 className="font-display text-[13px] sm:text-[15px] leading-snug group-hover:text-champagne-deep transition-colors duration-300 line-clamp-2">
              {lot.title}
            </h3>
            {lot.artist && (
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">{lot.artist}</p>
            )}
          </div>

          {/* Pinned to the bottom (the outer pt is the minimum gap) so prices
              line up across a grid row whatever the title length. */}
          {footer && (
            <div className="mt-auto pt-1.5 sm:pt-2">
              <div className="pt-1.5 sm:pt-2 border-t border-border/50">{footer}</div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
