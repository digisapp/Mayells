'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Heart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/types';
import type { Lot } from '@/db/schema/lots';

interface LotCardProps {
  lot: Lot;
  auctionSlug?: string;
  showBidInfo?: boolean;
}

export function LotCard({ lot, auctionSlug, showBidInfo = true }: LotCardProps) {
  const href = auctionSlug
    ? `/auctions/${auctionSlug}/lots/${lot.slug || lot.id}`
    : `/lots/${lot.slug || lot.id}`;

  return (
    <Link href={href} className="group block">
      <div className="relative aspect-[4/5] bg-muted rounded-md overflow-hidden mb-3">
        {lot.primaryImageUrl ? (
          <Image
            src={lot.primaryImageUrl}
            alt={lot.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            No Image
          </div>
        )}

        {lot.isFeatured && (
          <Badge className="absolute top-3 left-3 bg-champagne text-charcoal text-xs">
            Featured
          </Badge>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 bg-white/80 hover:bg-white h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.preventDefault();
            // TODO: add to watchlist
          }}
        >
          <Heart className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1">
        {lot.lotNumber && (
          <span className="text-xs text-muted-foreground">Lot {lot.lotNumber}</span>
        )}
        <h3 className="font-display text-base leading-snug group-hover:text-champagne transition-colors line-clamp-2">
          {lot.title}
        </h3>
        {lot.artist && (
          <p className="text-sm text-muted-foreground">{lot.artist}</p>
        )}

        {showBidInfo && lot.status === 'in_auction' && lot.currentBidAmount > 0 ? (
          <div className="pt-1">
            <p className="text-sm font-medium">
              Current Bid: {formatCurrency(lot.currentBidAmount)}
            </p>
            <p className="text-xs text-muted-foreground">{lot.bidCount} bid{lot.bidCount !== 1 ? 's' : ''}</p>
          </div>
        ) : (
          lot.estimateLow && lot.estimateHigh && (
            <p className="text-sm text-muted-foreground pt-1">
              Estimate: {formatCurrency(lot.estimateLow)} — {formatCurrency(lot.estimateHigh)}
            </p>
          )
        )}
      </div>
    </Link>
  );
}
