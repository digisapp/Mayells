import Link from 'next/link';
import Image from 'next/image';
import { AuctionCountdown } from '@/components/auctions/AuctionCountdown';
import { formatCurrency } from '@/types';
import type { Lot } from '@/db/schema/lots';

export interface ClosingSoonItem {
  lot: Lot;
  auctionSlug: string;
  closingAt: Date;
}

interface ClosingSoonRailProps {
  items: ClosingSoonItem[];
  serverNow: number;
}

export function ClosingSoonRail({ items, serverNow }: ClosingSoonRailProps) {
  if (items.length === 0) return null;

  return (
    <section className="relative bg-charcoal text-white overflow-hidden">
      <div className="absolute top-0 left-0 right-0 gradient-line" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="flex items-end justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            <h2 className="font-sans text-xl sm:text-2xl font-semibold tracking-tight">
              Closing Soon
            </h2>
          </div>
          <Link
            href="/auctions"
            className="text-[13px] text-white/50 hover:text-white transition-colors"
          >
            All auctions
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible snap-x snap-mandatory">
          {items.map(({ lot, auctionSlug, closingAt }) => (
            <Link
              key={lot.id}
              href={`/auctions/${auctionSlug}/lots/${lot.slug || lot.id}`}
              className="group flex-shrink-0 w-[240px] sm:w-auto snap-start"
            >
              <div className="rounded-xl overflow-hidden bg-white/[0.04] border border-white/10 hover:border-champagne/40 transition-all duration-300 hover:-translate-y-0.5">
                <div className="relative aspect-square bg-white/[0.03] overflow-hidden">
                  {lot.primaryImageUrl ? (
                    <Image
                      src={lot.primaryImageUrl}
                      alt={lot.title}
                      fill
                      sizes="(max-width: 640px) 240px, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="font-logo text-lg text-white/20">MAYELLS</span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pt-10 pb-2.5 px-3">
                    <AuctionCountdown
                      endsAt={closingAt}
                      serverNow={serverNow}
                      className="text-[13px] text-white"
                    />
                  </div>
                </div>
                <div className="p-3 sm:p-4 space-y-1">
                  <h3 className="text-[13px] sm:text-[14px] leading-snug line-clamp-2 group-hover:text-champagne transition-colors">
                    {lot.title}
                  </h3>
                  <div className="flex items-baseline justify-between pt-1">
                    {lot.currentBidAmount > 0 ? (
                      <>
                        <span className="text-[15px] font-semibold tracking-tight tabular-nums">
                          {formatCurrency(lot.currentBidAmount)}
                        </span>
                        <span className="text-[11px] text-white/40">
                          {lot.bidCount} bid{lot.bidCount !== 1 ? 's' : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[15px] font-semibold tracking-tight tabular-nums">
                          {formatCurrency(lot.startingBid ?? 0)}
                        </span>
                        <span className="text-[11px] text-champagne/80 uppercase tracking-wider">
                          Opening bid
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
