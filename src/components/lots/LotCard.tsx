'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Heart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { useState } from 'react';
import type { Lot } from '@/db/schema/lots';

interface LotCardProps {
  lot: Lot;
  auctionSlug?: string;
  showBidInfo?: boolean;
  isGallery?: boolean;
  isWatchlisted?: boolean;
}

export function LotCard({ lot, auctionSlug, showBidInfo = true, isGallery, isWatchlisted = false }: LotCardProps) {
  const { isAuthenticated } = useAuth();
  const [saved, setSaved] = useState(isWatchlisted);
  const [loading, setLoading] = useState(false);
  const galleryMode = isGallery || lot.saleType === 'gallery' || lot.saleType === 'private';
  const href = galleryMode
    ? `/gallery/${lot.slug || lot.id}`
    : auctionSlug
      ? `/auctions/${auctionSlug}/lots/${lot.slug || lot.id}`
      : `/lots/${lot.slug || lot.id}`;

  async function toggleWatchlist(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error('Sign in to save items to your watchlist');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/watchlist', {
        method: saved ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotId: lot.id }),
      });
      if (res.ok) {
        setSaved(!saved);
        toast.success(saved ? 'Removed from watchlist' : 'Added to watchlist');
      }
    } catch {
      toast.error('Failed to update watchlist');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Link href={href} className="group block">
      <div className="rounded-xl overflow-hidden glass-card border-glow-hover transition-all duration-500 hover:-translate-y-1">
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
              <span className="font-logo text-lg text-muted-foreground/40">MAYELL</span>
            </div>
          )}

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
            onClick={toggleWatchlist}
            disabled={loading}
          >
            <Heart className={`h-3.5 w-3.5 ${saved ? 'fill-red-500 text-red-500' : 'text-charcoal'}`} />
          </Button>
        </div>

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

          {lot.saleType === 'private' && !lot.buyNowPrice ? (
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
