import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';
import type { Auction } from '@/db/schema/auctions';
import { formatLongDate } from '@/lib/format/dates';

interface AuctionCardProps {
  /**
   * `visibleLotCount` comes from `auctionWithVisibleLotCount` — the lots the
   * sale page will actually list, not the denormalized `lotCount`.
   */
  auction: Auction & { visibleLotCount: number };
  /** Above the fold: load the cover straight away, since it is likely the LCP. */
  eager?: boolean;
  /** Override when the card is not in the standard 1/2/3-up grid (e.g. a phone rail). */
  sizes?: string;
}

// Badges sit on top of lot imagery — every variant needs a solid backdrop to stay legible.
const NEUTRAL_BADGE = 'bg-charcoal text-white border-0';

function getStatusLabel(status: string) {
  switch (status) {
    case 'open': return { label: 'Bidding Open', variant: 'default' as const, className: 'bg-emerald-700 text-white border-0' }; // -700: white on -600 is under 4.5:1 at 12px
    case 'preview': return { label: 'Preview', variant: 'secondary' as const, className: NEUTRAL_BADGE };
    case 'scheduled': return { label: 'Upcoming', variant: 'outline' as const, className: NEUTRAL_BADGE };
    case 'live': return { label: 'LIVE', variant: 'destructive' as const, className: 'bg-red-600 text-white border-0 motion-safe:animate-urgency' };
    case 'closing': return { label: 'Closing', variant: 'secondary' as const, className: NEUTRAL_BADGE };
    case 'closed':
    case 'completed': return { label: 'Closed', variant: 'secondary' as const, className: NEUTRAL_BADGE };
    case 'cancelled': return { label: 'Cancelled', variant: 'secondary' as const, className: NEUTRAL_BADGE };
    default: return { label: status, variant: 'outline' as const, className: NEUTRAL_BADGE };
  }
}

export function AuctionCard({
  auction,
  eager,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
}: AuctionCardProps) {
  const status = getStatusLabel(auction.status);
  const lotCount = auction.visibleLotCount;

  return (
    <Link
      href={`/auctions/${auction.slug}`}
      className="group block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="h-full rounded-xl overflow-hidden bg-card border border-border/70 transition-all duration-300 hover:border-champagne/40 hover:shadow-luxury">
        {/* Cover Image */}
        <div className="relative aspect-[16/9] bg-muted overflow-hidden">
          {auction.coverImageUrl ? (
            <Image
              src={auction.coverImageUrl}
              alt={auction.title}
              fill
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              sizes={sizes}
              loading={eager ? 'eager' : undefined}
              fetchPriority={eager ? 'high' : undefined}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-charcoal via-charcoal/95 to-graphite flex items-center justify-center">
              <span className="font-logo text-3xl text-white/20">MAYELLS</span>
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

          <Badge
            className={`absolute top-3 left-3 sm:top-4 sm:left-4 text-xs uppercase tracking-wider font-semibold shadow-sm ${status.className}`}
            variant={status.variant}
          >
            {status.label === 'LIVE' && (
              <span className="w-1.5 h-1.5 rounded-full bg-white mr-1.5 inline-block" />
            )}
            {status.label}
          </Badge>

          {/* Lot count pill — hidden until the catalogue has published lots,
              as on the sale page */}
          {lotCount > 0 && (
            <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 bg-charcoal rounded-full px-3 py-1 text-white text-xs font-medium tabular-nums">
              {lotCount} lot{lotCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="p-4 sm:p-5 space-y-1.5 sm:space-y-2">
          <h3 className="font-display text-lg sm:text-xl leading-tight group-hover:text-champagne-deep transition-colors duration-300">
            {auction.title}
          </h3>
          {auction.subtitle && (
            <p className="text-[13px] sm:text-sm text-muted-foreground line-clamp-1">{auction.subtitle}</p>
          )}
          <div className="flex items-center gap-3 sm:gap-4 text-[12px] sm:text-[13px] text-muted-foreground pt-1">
            {auction.biddingStartsAt && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatLongDate(auction.biddingStartsAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
