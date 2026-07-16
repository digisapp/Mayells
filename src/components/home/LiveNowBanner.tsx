import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Auction } from '@/db/schema/auctions';

export function LiveNowBanner({ auction }: { auction: Auction }) {
  return (
    <Link
      href={`/live/${auction.id}`}
      className="group block bg-charcoal text-white border-b border-white/10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-center gap-3 text-[13px] sm:text-sm">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        <span className="uppercase tracking-[0.15em] font-semibold text-red-400">Live now</span>
        <span className="text-white/70 truncate max-w-[40vw] sm:max-w-none">{auction.title}</span>
        <span className="hidden sm:flex items-center gap-1.5 text-champagne font-medium">
          Watch &amp; bid
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
