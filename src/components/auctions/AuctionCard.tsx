import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';
import type { Auction } from '@/db/schema/auctions';

interface AuctionCardProps {
  auction: Auction;
  /** Above the fold: load the cover straight away, since it is likely the LCP. */
  eager?: boolean;
  /** Override when the card is not in the standard 1/2/3-up grid (e.g. a phone rail). */
  sizes?: string;
}

function formatDate(date: Date | null) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    // Explicit zone so server (UTC) and client render identically — avoids hydration mismatch
    timeZone: 'America/New_York',
  }).format(new Date(date));
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'open': return { label: 'Bidding Open', variant: 'default' as const, className: 'bg-emerald-700 text-white border-0' }; // -700: white on -600 is under 4.5:1 at 11px
    // Badges sit on top of lot imagery — every variant needs a solid backdrop to stay legible.
    case 'preview': return { label: 'Preview', variant: 'secondary' as const, className: 'bg-black/60 text-white border-0 backdrop-blur-sm' };
    case 'scheduled': return { label: 'Upcoming', variant: 'outline' as const, className: 'bg-black/60 text-white border-white/25 backdrop-blur-sm' };
    case 'live': return { label: 'LIVE', variant: 'destructive' as const, className: 'bg-red-600 text-white border-0 animate-urgency' };
    case 'closed': return { label: 'Closed', variant: 'secondary' as const, className: 'bg-black/50 text-white/70 border-0 backdrop-blur-sm' };
    default: return { label: status, variant: 'outline' as const, className: 'bg-black/60 text-white border-white/25 backdrop-blur-sm' };
  }
}

export function AuctionCard({
  auction,
  eager,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
}: AuctionCardProps) {
  const status = getStatusLabel(auction.status);

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
            className={`absolute top-3 left-3 sm:top-4 sm:left-4 text-[11px] uppercase tracking-wider font-semibold shadow-sm ${status.className}`}
            variant={status.variant}
          >
            {status.label === 'LIVE' && (
              <span className="w-1.5 h-1.5 rounded-full bg-white mr-1.5 inline-block" />
            )}
            {status.label}
          </Badge>

          {/* Lot count pill */}
          <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 glass-dark rounded-full px-3 py-1 text-white text-xs font-medium">
            {auction.lotCount} lots
          </div>
        </div>

        {/* Details */}
        <div className="p-4 sm:p-5 space-y-1.5 sm:space-y-2">
          <h3 className="font-display text-lg sm:text-xl leading-tight group-hover:text-champagne transition-colors duration-300">
            {auction.title}
          </h3>
          {auction.subtitle && (
            <p className="text-[13px] sm:text-sm text-muted-foreground line-clamp-1">{auction.subtitle}</p>
          )}
          <div className="flex items-center gap-3 sm:gap-4 text-[12px] sm:text-[13px] text-muted-foreground pt-1">
            {auction.biddingStartsAt && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(auction.biddingStartsAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
