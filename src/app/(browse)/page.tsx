// ISR: serve from the CDN and re-render at most once a minute. Admin lot and
// auction mutations plus new bids also trigger on-demand revalidation, so the
// homepage stays fresh without paying a lambda + DB render per visitor.
export const revalidate = 60;

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { serializeJsonLd } from '@/lib/seo/structured-data';
import { publicLotPath } from '@/lib/lots/urls';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

const HOME_TITLE = 'Mayells | Auction House in Palm Beach & New York — Fine Art, Antiques, Jewelry';
const HOME_DESCRIPTION = 'Mayells is a luxury auction house in Palm Beach, Florida and New York. Live and online auctions for fine art, antiques, jewelry, watches, and design. Free appraisals and estate evaluations.';

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    type: 'website',
    url: BASE_URL,
    images: [{ url: `${BASE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'Mayells' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
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
import { bestAuctionSlugSql } from '@/lib/lots/auction-slug';
import { HeroAppraisalForm } from '@/components/home/HeroAppraisalForm';
import { ClosingSoonRail, type ClosingSoonItem } from '@/components/home/ClosingSoonRail';
import { LiveNowBanner } from '@/components/home/LiveNowBanner';
import { BUSINESS } from '@/lib/config';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Mayells',
  description: 'Luxury auction house in Palm Beach, Florida and New York. Auctions and private sales for fine art, antiques, jewelry, watches, and design.',
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
          .select({ lot: lots, auctionSlug: bestAuctionSlugSql })
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
        // Count only lots whose sale is actually open for bidding — lots in
        // preview/scheduled sales are catalogued but not yet biddable.
        db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(auctionLots)
          .innerJoin(lots, eq(auctionLots.lotId, lots.id))
          .innerJoin(auctions, eq(auctionLots.auctionId, auctions.id))
          .where(
            and(
              eq(lots.status, 'in_auction'),
              inArray(auctions.status, ['open', 'live', 'closing']),
              sql`${effectiveClose} > now()`,
            ),
          ),
      ]);

    const closingSoon: ClosingSoonItem[] = closingSoonRows.map((row) => ({
      lot: row.lot,
      auctionSlug: row.auctionSlug,
      closingAt: new Date(row.closingAt),
    }));

    return {
      upcomingAuctions,
      featuredLots: featuredLots.map(({ lot, auctionSlug }) => ({ ...lot, auctionSlug })),
      galleryLots,
      liveAuction: liveAuctions[0] ?? null,
      closingSoon,
      openLotCount: openLotCountRows[0]?.count ?? 0,
    };
  } catch {
    return {
      upcomingAuctions: [],
      featuredLots: [],
      galleryLots: [],
      liveAuction: null,
      closingSoon: [] as ClosingSoonItem[],
      openLotCount: 0,
    };
  }
}

export default async function HomePage() {
  const { upcomingAuctions, featuredLots, galleryLots, liveAuction, closingSoon, openLotCount } =
    await getHomeData();

  // Lead the hero with real artwork when we have it; the appraisal form moves
  // down to the How It Works section. With no featured imagery the form stays
  // in the hero as before.
  const heroLot = featuredLots.find((lot) => lot.primaryImageUrl) ?? null;
  const heroLotHref = heroLot ? publicLotPath(heroLot) : null;

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      {liveAuction && <LiveNowBanner auction={liveAuction} />}

      {/* Hero — Editorial, full-width. Below lg the featured lot's image runs
          full-bleed behind the copy (the same <img> becomes the framed panel
          at lg), so phones open on real artwork and download it only once. */}
      <section className="relative bg-charcoal text-white overflow-hidden">
        {/* Ambient texture and glow. Behind the phone artwork they would show
            as a seam where the image fades out, so they are desktop-only then. */}
        <div className={`${heroLot ? 'hidden lg:block ' : ''}absolute inset-0 opacity-[0.03]`} style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }} />
        <div className={`${heroLot ? 'hidden lg:block ' : ''}absolute top-0 right-0 w-2/3 h-full bg-gradient-to-l from-champagne/[0.07] to-transparent pointer-events-none`} />
        <div className={`${heroLot ? 'hidden lg:block ' : ''}absolute bottom-0 left-0 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-champagne/[0.04] rounded-full blur-[100px] pointer-events-none animate-float`} />
        <div className="absolute bottom-0 left-0 right-0 gradient-line" />

        <div
          className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full ${
            heroLot ? 'pt-4 pb-10 sm:pb-16 md:pb-20 lg:py-32' : 'py-16 sm:py-24 md:py-32'
          }`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-20 items-center">
            {/* z-10: sits above the full-bleed artwork on phones */}
            <div className="relative z-10">
              {heroLot && heroLotHref && (
                // Phone caption for the artwork behind the copy; the gap below
                // it is the unobstructed window onto the image.
                <Link
                  href={heroLotHref}
                  className="lg:hidden mb-36 inline-flex max-w-full items-center gap-2 min-h-10 rounded-full bg-black/70 backdrop-blur-sm border border-white/15 pl-3.5 pr-3 text-[13px] text-white outline-none focus-visible:ring-2 focus-visible:ring-champagne"
                >
                  <span className="text-eyebrow text-champagne shrink-0">Featured</span>
                  <span aria-hidden className="text-white/50">&middot;</span>
                  <span className="truncate">{heroLot.title}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                </Link>
              )}
              <p className="text-eyebrow text-champagne/90 mb-4 sm:mb-6">
                Palm Beach &middot; New York &middot; Online
              </p>
              <h1 className="font-display font-semibold text-[2.25rem] sm:text-[3rem] md:text-[3.5rem] leading-[1.1]">
                The Modern
                <br />
                Auction House
              </h1>
              <p className="mt-3 sm:mt-4 font-display text-xl sm:text-2xl text-champagne tracking-wide">
                Buy. Sell. Collect.
              </p>
              {/* Phones skip the long pitch so the artwork, headline and both
                  CTAs share the first screen; the h1 and tagline carry it. */}
              <p className={`${heroLot ? 'hidden sm:block ' : ''}mt-6 sm:mt-8 text-[15px] sm:text-[17px] text-white/70 max-w-md leading-relaxed`}>
                Discover exceptional fine art, jewelry, watches, and design from estates and private collections through expertly curated live and timed auctions with real-time bidding worldwide.
              </p>
              <div className="mt-7 sm:mt-12 grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:gap-4">
                <Button asChild variant="champagne" size="xl" className="shadow-gold px-4 has-[>svg]:px-4 sm:px-10 sm:has-[>svg]:px-6">
                  <Link href="/auctions">
                    Bid Now
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="champagne-outline" size="xl" className="backdrop-blur-sm px-4 sm:px-10">
                  <Link href="/consign">Sell With Us</Link>
                </Button>
              </div>
              <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-x-5 gap-y-1 sm:gap-6 text-[13px] text-white/70">
                <a href={BUSINESS.phoneHref} className="flex items-center gap-1.5 min-h-11 hover:text-white/90 transition-colors">
                  <Phone className="h-3.5 w-3.5" />
                  {BUSINESS.phone}
                </a>
                <span aria-hidden className="text-white/20">|</span>
                {openLotCount > 0 ? (
                  <span className="flex items-center gap-2">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                    </span>
                    {openLotCount} lot{openLotCount !== 1 ? 's' : ''} open for bidding
                  </span>
                ) : (
                  <span>Free Appraisals</span>
                )}
              </div>
            </div>
            <div className={heroLot ? undefined : 'hidden lg:block'}>
              {heroLot && heroLotHref ? (
                // Not positioned below lg, so this resolves against the hero
                // container: a full-bleed band behind the copy that fades into
                // the charcoal. At lg it is the framed 4:5 panel it always was.
                <div className="group absolute inset-x-0 top-0 h-[28rem] sm:h-[32rem] lg:relative lg:inset-auto lg:h-auto lg:aspect-[4/5] lg:max-w-md lg:ml-auto lg:rounded-2xl overflow-hidden lg:shadow-luxury">
                  <Image
                    src={heroLot.primaryImageUrl!}
                    alt={heroLot.title}
                    fill
                    preload
                    sizes="(min-width: 1024px) 28rem, 100vw"
                    className="object-cover transition-transform duration-700 ease-out lg:group-hover:scale-[1.03]"
                  />
                  {/* Phone scrim: light over the image window, then at least
                      86% charcoal from where the copy starts, so the champagne
                      eyebrow and white text keep AA over any artwork. */}
                  <div
                    aria-hidden
                    className="lg:hidden absolute inset-0"
                    style={{
                      backgroundImage:
                        'linear-gradient(to bottom, oklch(0.18 0.02 250 / 0.35) 0, oklch(0.18 0.02 250 / 0.1) 4.5rem, oklch(0.18 0.02 250 / 0.3) 9.25rem, oklch(0.18 0.02 250 / 0.86) 12.25rem, oklch(0.18 0.02 250 / 0.92) 17rem, oklch(0.18 0.02 250) 100%)',
                    }}
                  />
                  <Link
                    href={heroLotHref}
                    className="hidden lg:flex absolute inset-0 flex-col justify-end rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-champagne"
                  >
                    <div className="bg-gradient-to-t from-black/80 via-black/35 to-transparent pt-20 pb-5 px-5">
                      <p className="text-eyebrow text-champagne/90">Featured Lot</p>
                      <p className="font-display text-white text-lg leading-snug mt-1 line-clamp-2">{heroLot.title}</p>
                      {heroLot.artist && (
                        <p className="text-[13px] text-white/70 mt-0.5 line-clamp-1">{heroLot.artist}</p>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-white/80 mt-3 group-hover:text-white transition-colors">
                        View lot
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </Link>
                </div>
              ) : (
                <HeroAppraisalForm />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Closing Soon — live marketplace rail */}
      {/* No serverNow on this ISR page — a cached render time would inject up
          to `revalidate` seconds of artificial clock skew; client clocks are
          the better reference here. */}
      <ClosingSoonRail items={closingSoon} />

      {/* Trust Strip — first-party platform proof */}
      <section className="border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-10 gap-y-1 sm:gap-y-3 text-[12px] sm:text-[13px] uppercase tracking-[0.15em] text-muted-foreground">
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
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 md:py-28">
          <div className="flex items-end justify-between mb-7 sm:mb-14">
            <div>
              <span className="text-eyebrow text-champagne-deep">Upcoming</span>
              <h2 className="font-display text-display-md sm:text-display-lg mt-2">Current Sales</h2>
            </div>
            <Link href="/auctions" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors hidden sm:flex items-center gap-1.5 group">
              View all auctions
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {/* Phones: a snap rail (85% cards, the next one peeking) instead of
              six full-width cards stacked 2.5 screens deep. The grid is
              unchanged from 640px up. Vertical padding keeps focus rings
              from being clipped by the scroller. */}
          <ul
            role="list"
            aria-label="Current sales"
            className="flex gap-4 overflow-x-auto scrollbar-hide overscroll-x-contain snap-x snap-mandatory -mx-4 px-4 scroll-px-4 py-1.5 -my-1.5 sm:grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 sm:gap-8 sm:overflow-visible sm:mx-0 sm:px-0 sm:py-0 sm:my-0"
          >
            {upcomingAuctions.map((auction) => (
              <li key={auction.id} className="w-[85%] shrink-0 snap-start sm:w-auto">
                <AuctionCard
                  auction={auction}
                  sizes="(max-width: 640px) 85vw, (max-width: 1024px) 50vw, 33vw"
                />
              </li>
            ))}
          </ul>
          <MobileViewAll href="/auctions">View all auctions</MobileViewAll>
        </section>
      )}

      {/* Departments — full-width editorial grid */}
      <section className="relative bg-charcoal text-white py-12 sm:py-20 md:py-28 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 gradient-line" />
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-7 sm:mb-14">
            <span className="text-eyebrow text-champagne/90">Departments</span>
            <h2 className="font-display text-display-md sm:text-display-lg mt-2">What We Sell</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {[
              { name: 'Fine Art', href: '/categories/art', image: '/images/categories/fine-art.webp' },
              { name: 'Antiques', href: '/categories/antiques', image: '/images/categories/antiques.webp' },
              { name: 'Jewelry & Watches', href: '/categories/jewelry', image: '/images/categories/jewelry.webp' },
              { name: 'Fashion & Accessories', href: '/categories/fashion', image: '/images/categories/fashion.webp' },
              { name: 'Collectibles', href: '/categories/luxury', image: '/images/categories/collectibles.webp' },
              { name: 'Design & Furniture', href: '/categories/design', image: '/images/categories/design.webp' },
            ].map((cat) => (
              <Link key={cat.name} href={cat.href} className="group relative aspect-[4/3] rounded-xl overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal">
                <Image
                  src={cat.image}
                  alt={cat.name}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent transition-opacity duration-500 group-hover:from-black/80" />
                <div className="absolute bottom-0 left-0 right-0 p-3.5 sm:p-6">
                  <h3 className="font-display text-white text-[15px] leading-snug sm:text-lg">{cat.name}</h3>
                  <p className="text-[12px] sm:text-[13px] text-white/80 mt-0.5 sm:mt-1 opacity-100 translate-y-0 lg:opacity-0 lg:translate-y-2 lg:group-hover:opacity-100 lg:group-hover:translate-y-0 transition-all duration-300">
                    Browse collection
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works — clean consignment pitch */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 md:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center">
          <div>
            <span className="text-eyebrow text-champagne-deep">How It Works</span>
            <h2 className="font-display text-display-md sm:text-display-lg mt-2 mb-8 sm:mb-10">
              Sell With <span className="text-champagne-deep">Mayells</span>
            </h2>
            <div className="space-y-7 sm:space-y-8">
              {[
                {
                  step: '01',
                  title: 'Free Appraisal',
                  desc: 'Send us photos or call. A specialist talks you through what it could fetch and how best to sell it, with no obligation. For estates and larger collections, we can visit.',
                },
                {
                  step: '02',
                  title: 'Clear Terms, Nothing Upfront',
                  desc: 'Estimate, commission and any reserve are set out in writing. Photography, cataloguing and marketing are covered by our commission, which comes out of the sale.',
                },
                {
                  step: '03',
                  title: 'Sold Online, Then Paid',
                  desc: 'Your pieces are offered online to bidders worldwide. We manage the sale and pay you once the buyer has paid.',
                },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-5 sm:gap-6">
                  <span className="font-display text-champagne text-4xl font-light leading-none mt-0.5 tabular-nums">{s.step}</span>
                  <div>
                    <p className="font-semibold text-base mb-1.5">{s.title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 sm:mt-10 grid gap-3 sm:flex sm:flex-row sm:items-start">
              <Button asChild variant="champagne" size="lg" className="shadow-gold">
                <Link href="/consign">
                  Start Consigning
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href={BUSINESS.phoneHref}>
                  <Phone className="h-4 w-4" />
                  {BUSINESS.phone}
                </a>
              </Button>
            </div>
          </div>

          {/* Appraisal form: always here on mobile; on desktop only when the
              hero is showing artwork instead of the form. */}
          <div className={`${heroLot ? '' : 'lg:hidden '}bg-charcoal rounded-2xl p-1`}>
            <div className="text-white">
              <HeroAppraisalForm />
            </div>
          </div>
        </div>
      </section>

      {/* Featured Lots */}
      {featuredLots.length > 0 && (
        <section className="relative bg-secondary/40 py-12 sm:py-20 md:py-28">
          <div className="absolute top-0 left-0 right-0 gradient-line" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-7 sm:mb-14">
              <div>
                <span className="text-eyebrow text-champagne-deep">Curated</span>
                <h2 className="font-display text-display-md sm:text-display-lg mt-2">Featured Lots</h2>
              </div>
              <Link href="/lots" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors hidden sm:flex items-center gap-1.5 group">
                Browse all lots
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
              {featuredLots.map((lot, index) => (
                // Two rows (four lots) on phones; the button below leads on.
                <div key={lot.id} className={index >= 4 ? 'hidden sm:block' : undefined}>
                  <LotCard lot={lot} />
                </div>
              ))}
            </div>
            <MobileViewAll href="/lots">Browse all lots</MobileViewAll>
          </div>
        </section>
      )}

      {/* Shop the Gallery */}
      {galleryLots.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 md:py-28">
          <div className="flex items-end justify-between mb-7 sm:mb-14">
            <div>
              <span className="text-eyebrow text-champagne-deep">Buy Now</span>
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
          <MobileViewAll href="/gallery">View all gallery items</MobileViewAll>
        </section>
      )}

    </div>
  );
}

/**
 * Phone-only "view all" closing a section: a full-width 48px outline button
 * (the inline header link it stands in for is shown from 640px up).
 */
function MobileViewAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      asChild
      variant="outline"
      size="xl"
      className="sm:hidden mt-7 w-full bg-transparent shadow-none border-foreground/25 text-[13px] uppercase tracking-[0.14em] font-semibold hover:bg-foreground hover:text-background"
    >
      <Link href={href}>
        {children}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}
