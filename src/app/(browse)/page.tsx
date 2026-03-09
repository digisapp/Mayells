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
      <section className="relative bg-charcoal text-white overflow-hidden min-h-[50vh] sm:min-h-[60vh] flex items-center">
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

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20 w-full">
          <div className="max-w-2xl">
            <h1 className="font-display text-[2.5rem] sm:text-display-xl md:text-[5rem] leading-[1.05] tracking-tight">
              Fine Art. Antiques.
              <br />
              <span className="text-shimmer">Jewelry. Collectibles.</span>
            </h1>
            <p className="mt-4 sm:mt-6 text-[15px] sm:text-[17px] text-white/60 max-w-lg leading-relaxed">
              Discover rare and remarkable pieces from around the world. Expert cataloging,
              authentication, and appraisal for art, antiques, fashion, jewelry, and design.
            </p>
            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Link href="/consign" className="w-full sm:w-auto">
                <Button variant="champagne" size="xl" className="shadow-gold w-full sm:w-auto">
                  Sell With Us
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/services" className="w-full sm:w-auto">
                <Button variant="champagne-outline" size="xl" className="backdrop-blur-sm w-full sm:w-auto">
                  Free Appraisals
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
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 md:py-20">
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
        <section className="relative bg-secondary/40 py-10 sm:py-14 md:py-20">
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
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 md:py-20">
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

      {/* Departments - shown when no auction/lot sections are visible */}
      {upcomingAuctions.length === 0 && featuredLots.length === 0 && galleryLots.length === 0 && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 md:py-20">
          <div className="text-center mb-10">
            <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Departments</span>
            <h2 className="font-display text-display-sm sm:text-display-md mt-1.5">What We Handle</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              'Fine Art & Paintings',
              'Antiques & Furniture',
              'Jewelry & Watches',
              'Fashion & Accessories',
              'Collectibles & Memorabilia',
              'Design & Decorative Arts',
            ].map((dept) => (
              <div key={dept} className="text-center bg-charcoal/[0.03] border border-black/5 rounded-xl px-4 py-6">
                <p className="text-sm font-medium">{dept}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
