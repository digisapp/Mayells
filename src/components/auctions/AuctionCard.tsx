'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock } from 'lucide-react';
import type { Auction } from '@/db/schema/auctions';

interface AuctionCardProps {
  auction: Auction;
}

function formatDate(date: Date | null) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'open': return { label: 'Bidding Open', variant: 'default' as const, className: 'bg-emerald-600 text-white border-0' };
    case 'preview': return { label: 'Preview', variant: 'secondary' as const, className: '' };
    case 'scheduled': return { label: 'Upcoming', variant: 'outline' as const, className: '' };
    case 'live': return { label: 'LIVE', variant: 'destructive' as const, className: 'bg-red-600 text-white border-0 animate-urgency' };
    case 'closed': return { label: 'Closed', variant: 'secondary' as const, className: 'opacity-70' };
    default: return { label: status, variant: 'outline' as const, className: '' };
  }
}

export function AuctionCard({ auction }: AuctionCardProps) {
  const status = getStatusLabel(auction.status);

  return (
    <Link href={`/auctions/${auction.slug}`} className="group block">
      <div className="rounded-xl overflow-hidden shadow-luxury transition-all duration-500 hover:shadow-luxury-hover hover:-translate-y-1 bg-card">
        {/* Cover Image */}
        <div className="relative aspect-[16/9] bg-muted overflow-hidden">
          {auction.coverImageUrl ? (
            <Image
              src={auction.coverImageUrl}
              alt={auction.title}
              fill
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-charcoal via-charcoal/95 to-graphite flex items-center justify-center">
              <span className="font-display text-3xl text-white/20 tracking-[0.2em]">MAYELLS</span>
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

          <Badge
            className={`absolute top-4 left-4 text-[10px] uppercase tracking-wider font-semibold shadow-sm ${status.className}`}
            variant={status.variant}
          >
            {status.label === 'LIVE' && (
              <span className="w-1.5 h-1.5 rounded-full bg-white mr-1.5 inline-block" />
            )}
            {status.label}
          </Badge>

          {/* Lot count pill */}
          <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 text-white text-xs font-medium">
            {auction.lotCount} lots
          </div>
        </div>

        {/* Details */}
        <div className="p-5 space-y-2">
          <h3 className="font-display text-xl leading-tight group-hover:text-champagne transition-colors duration-300">
            {auction.title}
          </h3>
          {auction.subtitle && (
            <p className="text-sm text-muted-foreground line-clamp-1">{auction.subtitle}</p>
          )}
          <div className="flex items-center gap-4 text-[13px] text-muted-foreground pt-1">
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
