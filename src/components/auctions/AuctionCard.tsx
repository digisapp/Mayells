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
    case 'open': return { label: 'Bidding Open', variant: 'default' as const };
    case 'preview': return { label: 'Preview', variant: 'secondary' as const };
    case 'scheduled': return { label: 'Upcoming', variant: 'outline' as const };
    case 'live': return { label: 'Live Now', variant: 'destructive' as const };
    case 'closed': return { label: 'Closed', variant: 'secondary' as const };
    default: return { label: status, variant: 'outline' as const };
  }
}

export function AuctionCard({ auction }: AuctionCardProps) {
  const status = getStatusLabel(auction.status);

  return (
    <Link href={`/auctions/${auction.slug}`} className="group block">
      <div className="relative aspect-[16/9] bg-muted rounded-lg overflow-hidden mb-4">
        {auction.coverImageUrl ? (
          <Image
            src={auction.coverImageUrl}
            alt={auction.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-charcoal to-graphite flex items-center justify-center">
            <span className="font-display text-2xl text-white/60">MAYELLS</span>
          </div>
        )}
        <Badge className="absolute top-3 left-3" variant={status.variant}>
          {status.label}
        </Badge>
      </div>

      <div className="space-y-2">
        <h3 className="font-display text-display-sm group-hover:text-champagne transition-colors">
          {auction.title}
        </h3>
        {auction.subtitle && (
          <p className="text-muted-foreground">{auction.subtitle}</p>
        )}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {auction.biddingStartsAt && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatDate(auction.biddingStartsAt)}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {auction.lotCount} lots
          </span>
        </div>
      </div>
    </Link>
  );
}
