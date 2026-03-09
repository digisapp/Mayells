export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Mayell Auctions | Fine Art Antiques Design Fashion Collectibles',
  description: 'Luxury auctions and private sales for fine art, antiques, jewelry, watches, and design. Free appraisals and estate evaluations.',
};
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { db } from '@/db';
import { auctions, lots } from '@/db/schema';
import { inArray, desc, eq, and } from 'drizzle-orm';
import { AuctionCard } from '@/components/auctions/AuctionCard';
import { LotCard } from '@/components/lots/LotCard';
import { ServicesBar } from '@/components/home/ServicesBar';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Mayell',
  description: 'Luxury auctions and private sales for fine art, antiques, jewelry, watches, and design.',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://mayellauctions.com',
  sameAs: [],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    email: 'support@mayellauctions.com',
  },
};

async function getHomeData() {
  try {
    const [upcomingAuctions, featuredLots, galleryLots] = await Promise.all([
      db
        .select()
        .from(auctions)
        .where(inArray(auctions.status, ['live', 'open', 'scheduled', 'preview']))
        .orderBy(desc(auctions.createdAt))
        .limit(6),
      db
        .select()
        .from(lots)
        .where(eq(lots.isFeatured, true))
        .orderBy(desc(lots.createdAt))
        .limit(8),
      db
        .select()
        .from(lots)
        .where(and(eq(lots.saleType, 'gallery'), eq(lots.status, 'for_sale')))
        .orderBy(desc(lots.createdAt))
        .limit(4),
    ]);
    return { upcomingAuctions, featuredLots, galleryLots };
  } catch {
    return { upcomingAuctions: [], featuredLots: [], galleryLots: [] };
  }
}

export default async function HomePage() {
  const { upcomingAuctions, featuredLots, galleryLots } = await getHomeData();

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <section className="relative bg-charcoal text-white overflow-hidden min-h-[70vh] sm:min-h-[85vh] flex items-center">
        {/* Dot grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }} />
        {/* Champagne glow - top right */}
        <div className="absolute top-0 right-0 w-2/3 h-full bg-gradient-to-l from-champagne/[0.07] to-transparent pointer-events-none" />
        {/* Floating orbs */}
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-champagne/[0.04] rounded-full blur-[100px] pointer-events-none animate-float" />
        <div className="absolute top-20 right-10 sm:right-20 w-48 sm:w-72 h-48 sm:h-72 bg-champagne/[0.03] rounded-full blur-[80px] pointer-events-none animate-float" style={{ animationDelay: '-3s' }} />
        {/* Gradient line accent */}
        <div className="absolute bottom-0 left-0 right-0 gradient-line" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 md:py-32 w-full">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 glass-dark rounded-full px-4 sm:px-5 py-2 mb-6 sm:mb-8 border-glow">
              <span className="text-[12px] sm:text-[13px] text-white/80 tracking-wide">Fine Art &middot; Antiques &middot; Design &middot; Fashion &middot; Collectibles</span>
            </div>

            <h1 className="font-display text-[2.5rem] sm:text-display-xl md:text-[5rem] leading-[1.05] tracking-tight">
              Extraordinary Objects,
              <br />
              <span className="text-shimmer">Exceptional Service</span>
            </h1>
            <p className="mt-4 sm:mt-6 text-[15px] sm:text-[17px] text-white/60 max-w-lg leading-relaxed">
              Discover rare and remarkable pieces from around the world. Expert cataloging,
              authentication, and appraisal for art, antiques, fashion, jewelry, and design.
            </p>
            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Link href="/auctions" className="w-full sm:w-auto">
                <Button variant="champagne" size="xl" className="shadow-gold w-full sm:w-auto">
                  Browse Auctions
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/signup" className="w-full sm:w-auto">
                <Button variant="champagne-outline" size="xl" className="backdrop-blur-sm w-full sm:w-auto">
                  Create Account
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Services / Free Appraisals */}
      <ServicesBar />

      {/* Upcoming Auctions */}
      {upcomingAuctions.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 md:py-28">
          <div className="flex items-end justify-between mb-8 sm:mb-12">
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Auctions</span>
              <h2 className="font-display text-display-sm sm:text-display-md mt-1.5 sm:mt-2">Upcoming Sales</h2>
            </div>
            <Link href="/auctions" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors hidden sm:flex items-center gap-1.5 group">
              View all auctions
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {upcomingAuctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
          <Link href="/auctions" className="sm:hidden flex items-center justify-center gap-1.5 mt-6 text-[13px] text-champagne font-medium">
            View all auctions
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      {/* Featured Lots */}
      {featuredLots.length > 0 && (
        <section className="relative bg-secondary/40 py-12 sm:py-20 md:py-28">
          <div className="absolute top-0 left-0 right-0 gradient-line" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-8 sm:mb-12">
              <div>
                <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Curated</span>
                <h2 className="font-display text-display-sm sm:text-display-md mt-1.5 sm:mt-2">Featured Lots</h2>
              </div>
              <Link href="/lots" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors hidden sm:flex items-center gap-1.5 group">
                Browse all lots
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {featuredLots.map((lot) => (
                <LotCard key={lot.id} lot={lot} />
              ))}
            </div>
            <Link href="/lots" className="sm:hidden flex items-center justify-center gap-1.5 mt-6 text-[13px] text-champagne font-medium">
              Browse all lots
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      )}

      {/* Shop the Gallery */}
      {galleryLots.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 md:py-28">
          <div className="flex items-end justify-between mb-8 sm:mb-12">
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Buy Now</span>
              <h2 className="font-display text-display-sm sm:text-display-md mt-1.5 sm:mt-2">Shop the Gallery</h2>
            </div>
            <Link href="/gallery" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors hidden sm:flex items-center gap-1.5 group">
              View all
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {galleryLots.map((lot) => (
              <LotCard key={lot.id} lot={lot} isGallery />
            ))}
          </div>
          <Link href="/gallery" className="sm:hidden flex items-center justify-center gap-1.5 mt-6 text-[13px] text-champagne font-medium">
            View all gallery items
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      {/* CTA */}
      <section className="relative bg-charcoal text-white py-20 md:py-28 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 gradient-line" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-champagne/[0.04] rounded-full blur-[120px] pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Consignment</span>
          <h2 className="font-display text-display-md text-white mt-2 mb-4">Ready to Sell?</h2>
          <p className="text-white/50 max-w-lg mx-auto mb-10 text-[15px] leading-relaxed">
            Have an extraordinary item? Our specialists provide complimentary appraisals.
            Submit your piece for consignment and reach collectors worldwide.
          </p>
          <Link href="/consign">
            <Button variant="champagne" size="xl" className="shadow-gold">
              Submit for Consignment
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
