export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { serializeJsonLd } from '@/lib/seo/structured-data';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

export const metadata: Metadata = {
  title: 'Mayells | Fine Art Antiques Design Fashion Collectibles',
  description: 'Luxury auctions and private sales for fine art, antiques, jewelry, watches, and design. Free appraisals and estate evaluations.',
  openGraph: {
    title: 'Mayells | Fine Art Antiques Design Fashion Collectibles',
    description: 'Luxury auctions and private sales for fine art, antiques, jewelry, watches, and design. Free appraisals and estate evaluations.',
    type: 'website',
    url: BASE_URL,
    images: [{ url: `${BASE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'Mayells' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mayells | Fine Art Antiques Design Fashion Collectibles',
    description: 'Luxury auctions and private sales for fine art, antiques, jewelry, watches, and design.',
    images: [`${BASE_URL}/opengraph-image`],
  },
};
import { Button } from '@/components/ui/button';
import { ArrowRight, Phone } from 'lucide-react';
import { db } from '@/db';
import { auctions, auctionLots, lots } from '@/db/schema';
import { inArray, desc, eq, and, sql, asc } from 'drizzle-orm';
import { AuctionCard } from '@/components/auctions/AuctionCard';
import { LotCard } from '@/components/lots/LotCard';
import { HeroAppraisalForm } from '@/components/home/HeroAppraisalForm';
import { ClosingSoonRail, type ClosingSoonItem } from '@/components/home/ClosingSoonRail';
import { LiveNowBanner } from '@/components/home/LiveNowBanner';
import { BUSINESS } from '@/lib/config';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Mayell',
  description: 'Luxury auctions and private sales for fine art, antiques, jewelry, watches, and design.',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com',
  sameAs: [],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    email: 'info@mayells.com',
  },
};

async function getHomeData() {
  try {
    // Effective close time: per-lot staggered close when set, else the sale's end.
    const effectiveClose = sql`coalesce(${auctionLots.closingAt}, ${auctions.biddingEndsAt})`;
    const [upcomingAuctions, featuredLots, galleryLots, liveAuctions, closingSoonRows, openLotCountRows] =
      await Promise.all([
        db
          .select()
          .from(auctions)
          .where(inArray(auctions.status, ['live', 'open', 'scheduled', 'preview']))
          .orderBy(desc(auctions.createdAt))
          .limit(6),
        db
          .select()
          .from(lots)
          // Only surface publicly-visible featured lots — a featured draft or
          // withdrawn lot would render on the homepage and link to a 404.
          .where(and(eq(lots.isFeatured, true), inArray(lots.status, ['for_sale', 'in_auction', 'sold'])))
          .orderBy(desc(lots.createdAt))
          .limit(8),
        db
          .select()
          .from(lots)
          .where(and(eq(lots.saleType, 'gallery'), eq(lots.status, 'for_sale')))
          .orderBy(desc(lots.createdAt))
          .limit(4),
        db
          .select()
          .from(auctions)
          .where(eq(auctions.status, 'live'))
          .orderBy(desc(auctions.updatedAt))
          .limit(1),
        db
          .select({ lot: lots, auctionSlug: auctions.slug, closingAt: effectiveClose.mapWith(String) })
          .from(auctionLots)
          .innerJoin(lots, eq(auctionLots.lotId, lots.id))
          .innerJoin(auctions, eq(auctionLots.auctionId, auctions.id))
          .where(
            and(
              eq(lots.status, 'in_auction'),
              inArray(auctions.status, ['open', 'live', 'closing']),
              sql`${effectiveClose} > now()`,
            ),
          )
          .orderBy(asc(effectiveClose))
          .limit(8),
        db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(lots)
          .where(eq(lots.status, 'in_auction')),
      ]);

    const closingSoon: ClosingSoonItem[] = closingSoonRows.map((row) => ({
      lot: row.lot,
      auctionSlug: row.auctionSlug,
      closingAt: new Date(row.closingAt),
    }));

    return {
      upcomingAuctions,
      featuredLots,
      galleryLots,
      liveAuction: liveAuctions[0] ?? null,
      closingSoon,
      openLotCount: openLotCountRows[0]?.count ?? 0,
      serverNow: Date.now(),
    };
  } catch {
    return {
      upcomingAuctions: [],
      featuredLots: [],
      galleryLots: [],
      liveAuction: null,
      closingSoon: [] as ClosingSoonItem[],
      openLotCount: 0,
      serverNow: Date.now(),
    };
  }
}

export default async function HomePage() {
  const { upcomingAuctions, featuredLots, galleryLots, liveAuction, closingSoon, openLotCount, serverNow } =
    await getHomeData();

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      {liveAuction && <LiveNowBanner auction={liveAuction} />}

      {/* Hero — Editorial, full-width */}
      <section className="relative bg-charcoal text-white overflow-hidden">
        {/* Subtle texture */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute top-0 right-0 w-2/3 h-full bg-gradient-to-l from-champagne/[0.07] to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-champagne/[0.04] rounded-full blur-[100px] pointer-events-none animate-float" />
        <div className="absolute bottom-0 left-0 right-0 gradient-line" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 md:py-32 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-champagne/80 font-semibold mb-6">
                Boca Raton &middot; New York &middot; Online
              </p>
              <h1 className="font-sans font-semibold text-[2.25rem] sm:text-[3rem] md:text-[3.5rem] leading-[1.05] tracking-tight">
                The auction house,
                <br />
                built for right now.
              </h1>
              <p className="mt-6 sm:mt-8 text-[15px] sm:text-[17px] text-white/55 max-w-md leading-relaxed">
                Fine art, jewelry, watches, and design from estates and private collections — sold in live-streamed and timed auctions with real-time bidding, anywhere in the world.
              </p>
              <div className="mt-10 sm:mt-12 flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Link href="/auctions" className="w-full sm:w-auto">
                  <Button variant="champagne" size="xl" className="shadow-gold w-full sm:w-auto">
                    Bid Now
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/consign" className="w-full sm:w-auto">
                  <Button variant="champagne-outline" size="xl" className="backdrop-blur-sm w-full sm:w-auto">
                    Sell With Us
                  </Button>
                </Link>
              </div>
              <div className="mt-6 flex items-center gap-6 text-[13px] text-white/40">
                <a href={BUSINESS.phoneHref} className="flex items-center gap-1.5 hover:text-white/60 transition-colors">
                  <Phone className="h-3.5 w-3.5" />
                  {BUSINESS.phone}
                </a>
                <span className="text-white/20">|</span>
                {openLotCount > 0 ? (
                  <span className="flex items-center gap-2">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                    </span>
                    {openLotCount} lot{openLotCount !== 1 ? 's' : ''} open for bidding
                  </span>
                ) : (
                  <span>Free Appraisals</span>
                )}
              </div>
            </div>
            <div className="hidden lg:block">
              <HeroAppraisalForm />
            </div>
          </div>
        </div>
      </section>

      {/* Closing Soon — live marketplace rail */}
      <ClosingSoonRail items={closingSoon} serverNow={serverNow} />

      {/* Trust Strip — first-party platform proof */}
      <section className="border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[12px] sm:text-[13px] uppercase tracking-[0.15em] text-muted-foreground/70">
            <span>Real-Time Bidding</span>
            <span className="hidden sm:inline text-border">|</span>
            <span>Verified Bidders</span>
            <span className="hidden sm:inline text-border">|</span>
            <span>Secure Payments</span>
            <span className="hidden sm:inline text-border">|</span>
            <span>Free Appraisals</span>
            <span className="hidden sm:inline text-border">|</span>
            <span>White Glove Delivery</span>
          </div>
        </div>
      </section>

      {/* Upcoming Auctions — editorial event cards */}
      {upcomingAuctions.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 md:py-28">
          <div className="flex items-end justify-between mb-10 sm:mb-14">
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Upcoming</span>
              <h2 className="font-display text-display-md sm:text-display-lg mt-2">Current Sales</h2>
            </div>
            <Link href="/auctions" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors hidden sm:flex items-center gap-1.5 group">
              View all auctions
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-8">
            {upcomingAuctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
          <Link href="/auctions" className="sm:hidden flex items-center justify-center gap-1.5 mt-8 text-[13px] text-champagne font-medium">
            View all auctions
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      {/* Departments — full-width editorial grid */}
      <section className="relative bg-charcoal text-white py-14 sm:py-20 md:py-28 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 gradient-line" />
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-14">
            <span className="text-[11px] uppercase tracking-[0.2em] text-champagne/80 font-semibold">Departments</span>
            <h2 className="font-display text-display-md sm:text-display-lg mt-2">What We Sell</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {[
              { name: 'Fine Art', href: '/gallery', image: '/images/categories/fine-art.webp' },
              { name: 'Antiques', href: '/gallery', image: '/images/categories/antiques.webp' },
              { name: 'Jewelry & Watches', href: '/gallery', image: '/images/categories/jewelry.webp' },
              { name: 'Fashion & Accessories', href: '/gallery', image: '/images/categories/fashion.webp' },
              { name: 'Collectibles', href: '/gallery', image: '/images/categories/collectibles.webp' },
              { name: 'Design & Furniture', href: '/gallery', image: '/images/categories/design.webp' },
            ].map((cat) => (
              <Link key={cat.name} href={cat.href} className="group relative aspect-[4/3] rounded-xl overflow-hidden">
                <Image
                  src={cat.image}
                  alt={cat.name}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent transition-opacity duration-500 group-hover:from-black/80" />
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
                  <h3 className="font-display text-white text-sm sm:text-lg">{cat.name}</h3>
                  <p className="text-[11px] sm:text-[13px] text-white/50 mt-1 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                    Browse collection
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works — clean consignment pitch */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 md:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">How It Works</span>
            <h2 className="font-display text-display-md sm:text-display-lg mt-2 mb-10">
              Sell With <span className="text-champagne">Mayell</span>
            </h2>
            <div className="space-y-8">
              {[
                {
                  step: '01',
                  title: 'Free In-Person or Online Appraisal',
                  desc: 'Send us photos or schedule a free house call. Our team in Boca Raton and New York can come to you for appraisals and pickup.',
                },
                {
                  step: '02',
                  title: 'We Handle Everything',
                  desc: 'From same-day estate cleanouts to professional photography and cataloging — we pick up your items and prepare them for sale.',
                },
                {
                  step: '03',
                  title: 'Live Online Auction',
                  desc: 'Your items go up for bidding in our live-streamed and timed auctions, open to verified bidders worldwide. We manage the entire sale and send you payment.',
                },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-6">
                  <span className="font-display text-champagne text-4xl font-light leading-none mt-0.5 tabular-nums">{s.step}</span>
                  <div>
                    <p className="font-semibold text-base mb-1.5">{s.title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-col sm:flex-row items-start gap-3">
              <Link href="/consign">
                <Button variant="champagne" className="gap-2 shadow-gold">
                  Start Consigning
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href={BUSINESS.phoneHref}>
                <Button variant="outline" className="gap-2">
                  <Phone className="h-4 w-4" />
                  {BUSINESS.phone}
                </Button>
              </a>
            </div>
          </div>

          {/* Mobile appraisal form (visible on all screens in this section) */}
          <div className="lg:hidden bg-charcoal rounded-2xl p-1">
            <div className="text-white">
              <HeroAppraisalForm />
            </div>
          </div>
        </div>
      </section>

      {/* Featured Lots */}
      {featuredLots.length > 0 && (
        <section className="relative bg-secondary/40 py-14 sm:py-20 md:py-28">
          <div className="absolute top-0 left-0 right-0 gradient-line" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-10 sm:mb-14">
              <div>
                <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Curated</span>
                <h2 className="font-display text-display-md sm:text-display-lg mt-2">Featured Lots</h2>
              </div>
              <Link href="/lots" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors hidden sm:flex items-center gap-1.5 group">
                Browse all lots
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
              {featuredLots.map((lot) => (
                <LotCard key={lot.id} lot={lot} />
              ))}
            </div>
            <Link href="/lots" className="sm:hidden flex items-center justify-center gap-1.5 mt-8 text-[13px] text-champagne font-medium">
              Browse all lots
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      )}

      {/* Shop the Gallery */}
      {galleryLots.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 md:py-28">
          <div className="flex items-end justify-between mb-10 sm:mb-14">
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Buy Now</span>
              <h2 className="font-display text-display-md sm:text-display-lg mt-2">Shop the Gallery</h2>
            </div>
            <Link href="/gallery" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors hidden sm:flex items-center gap-1.5 group">
              View all
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
            {galleryLots.map((lot) => (
              <LotCard key={lot.id} lot={lot} isGallery />
            ))}
          </div>
          <Link href="/gallery" className="sm:hidden flex items-center justify-center gap-1.5 mt-8 text-[13px] text-champagne font-medium">
            View all gallery items
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

    </div>
  );
}
