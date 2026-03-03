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
  isGallery?: boolean;
}

export function LotCard({ lot, auctionSlug, showBidInfo = true, isGallery }: LotCardProps) {
  const galleryMode = isGallery || lot.saleType === 'gallery';
  const privateMode = lot.saleType === 'private';
  const href = privateMode
    ? `/private-sales/${lot.slug || lot.id}`
    : galleryMode
      ? `/gallery/${lot.slug || lot.id}`
      : auctionSlug
        ? `/auctions/${auctionSlug}/lots/${lot.slug || lot.id}`
        : `/lots/${lot.slug || lot.id}`;

  return (
    <Link href={href} className="group block">
      <div className="rounded-xl overflow-hidden shadow-luxury transition-all duration-500 hover:shadow-luxury-hover hover:-translate-y-1 bg-card">
        {/* Image */}
        <div className="relative aspect-[3/4] bg-muted overflow-hidden">
          {lot.primaryImageUrl ? (
            <Image
              src={lot.primaryImageUrl}
              alt={lot.title}
              fill
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center">
              <span className="font-display text-lg text-muted-foreground/40 tracking-widest">MAYELLS</span>
            </div>
          )}

          {/* Subtle gradient overlay at bottom */}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

          {lot.isFeatured && (
            <Badge className="absolute top-3 left-3 bg-champagne text-charcoal text-[10px] uppercase tracking-wider font-semibold border-0 shadow-sm">
              Featured
            </Badge>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm hover:bg-white h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-sm"
            onClick={(e) => {
              e.preventDefault();
            }}
          >
            <Heart className="h-3.5 w-3.5 text-charcoal" />
          </Button>
        </div>

        {/* Details */}
        <div className="p-4 space-y-1.5">
          {lot.lotNumber && (
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Lot {lot.lotNumber}
            </span>
          )}
          <h3 className="font-display text-[15px] leading-snug group-hover:text-champagne transition-colors duration-300 line-clamp-2">
            {lot.title}
          </h3>
          {lot.artist && (
            <p className="text-sm text-muted-foreground">{lot.artist}</p>
          )}

          {privateMode ? (
            <div className="pt-2 border-t border-border/50 mt-2">
              <p className="text-[11px] text-champagne font-medium uppercase tracking-wider">
                Inquire for Price
              </p>
            </div>
          ) : galleryMode && lot.buyNowPrice ? (
            <div className="pt-2 border-t border-border/50 mt-2">
              <p className="text-sm font-semibold tracking-tight">
                {formatCurrency(lot.buyNowPrice)}
              </p>
              <p className="text-[11px] text-champagne font-medium uppercase tracking-wider">
                Buy Now
              </p>
            </div>
          ) : showBidInfo && lot.status === 'in_auction' && lot.currentBidAmount > 0 ? (
            <div className="pt-2 border-t border-border/50 mt-2">
              <p className="text-sm font-semibold tracking-tight">
                {formatCurrency(lot.currentBidAmount)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {lot.bidCount} bid{lot.bidCount !== 1 ? 's' : ''}
              </p>
            </div>
          ) : (
            lot.estimateLow && lot.estimateHigh && (
              <p className="text-[13px] text-muted-foreground pt-2 border-t border-border/50 mt-2">
                Est. {formatCurrency(lot.estimateLow)} — {formatCurrency(lot.estimateHigh)}
              </p>
            )
          )}
        </div>
      </div>
    </Link>
  );
}
