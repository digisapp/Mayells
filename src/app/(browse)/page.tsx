export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, Shield, Zap } from 'lucide-react';
import { db } from '@/db';
import { auctions, lots } from '@/db/schema';
import { inArray, desc, eq } from 'drizzle-orm';
import { AuctionCard } from '@/components/auctions/AuctionCard';
import { LotCard } from '@/components/lots/LotCard';

const categories = [
  { name: 'Art', slug: 'art', description: 'Contemporary, Modern & Old Masters' },
  { name: 'Antiques', slug: 'antiques', description: 'Fine antiques & period furniture' },
  { name: 'Luxury', slug: 'luxury', description: 'Watches, cars & rare collectibles' },
  { name: 'Fashion', slug: 'fashion', description: 'Haute couture & vintage' },
  { name: 'Jewelry', slug: 'jewelry', description: 'Fine jewelry & precious stones' },
  { name: 'Design', slug: 'design', description: 'Furniture, lighting & objects' },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Mayells',
  description: 'AI-powered luxury auctions for art, antiques, fashion, jewelry, and design.',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com',
  sameAs: [],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    email: 'support@mayells.com',
  },
};

export default async function HomePage() {
  const [upcomingAuctions, featuredLots] = await Promise.all([
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
  ]);

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <section className="relative bg-charcoal text-white overflow-hidden min-h-[85vh] flex items-center">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-champagne/[0.05] to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-champagne/[0.03] rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 w-full">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/[0.06] backdrop-blur-sm border border-white/10 rounded-full px-4 py-1.5 mb-8">
              <Sparkles className="h-3.5 w-3.5 text-champagne" />
              <span className="text-[13px] text-white/70 tracking-wide">AI-Powered Auction Platform</span>
            </div>

            <h1 className="font-display text-display-xl md:text-[5rem] leading-[1.02] tracking-tight">
              The Auction House
              <br />
              <span className="text-champagne">of the Future</span>
            </h1>
            <p className="mt-6 text-[17px] text-white/60 max-w-lg leading-relaxed">
              Discover extraordinary objects from around the world. AI-powered cataloging,
              authentication, and appraisal for art, antiques, fashion, jewelry, and design.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/auctions">
                <Button variant="champagne" size="xl">
                  Browse Auctions
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/signup">
                <Button variant="champagne-outline" size="xl">
                  Create Account
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming Auctions */}
      {upcomingAuctions.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="flex items-end justify-between mb-12">
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Auctions</span>
              <h2 className="font-display text-display-md mt-2">Upcoming Sales</h2>
            </div>
            <Link href="/auctions" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors hidden sm:flex items-center gap-1.5 group">
              View all auctions
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {upcomingAuctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        </section>
      )}

      {/* Featured Lots */}
      {featuredLots.length > 0 && (
        <section className="bg-secondary/40 py-20 md:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-12">
              <div>
                <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Curated</span>
                <h2 className="font-display text-display-md mt-2">Featured Lots</h2>
              </div>
              <Link href="/lots" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors hidden sm:flex items-center gap-1.5 group">
                Browse all lots
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {featuredLots.map((lot) => (
                <LotCard key={lot.id} lot={lot} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="flex items-end justify-between mb-12">
          <div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Explore</span>
            <h2 className="font-display text-display-md mt-2">Browse by Category</h2>
          </div>
          <Link href="/lots" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors hidden sm:flex items-center gap-1.5 group">
            View all lots
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="group relative aspect-[3/4] bg-charcoal rounded-xl overflow-hidden flex items-end p-5 shadow-luxury hover:shadow-luxury-hover transition-all duration-500"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/60 to-charcoal/30 group-hover:via-charcoal/40 transition-all duration-700" />
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-champagne/0 to-transparent group-hover:via-champagne transition-all duration-500" />

              <div className="relative z-10">
                <h3 className="font-display text-lg text-white group-hover:text-champagne transition-colors duration-300">
                  {cat.name}
                </h3>
                <p className="text-[11px] text-white/40 mt-0.5 hidden sm:block group-hover:text-white/60 transition-colors duration-300">
                  {cat.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-secondary/40 py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Process</span>
            <h2 className="font-display text-display-md mt-2">How Mayells Works</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            {[
              {
                step: '01',
                icon: Sparkles,
                title: 'Discover',
                description: 'Browse curated auctions across art, antiques, fashion, jewelry, and design. AI-powered recommendations surface lots you\'ll love.',
              },
              {
                step: '02',
                icon: Zap,
                title: 'Bid',
                description: 'Place bids in real-time on timed online auctions or live streams. Set maximum bids and our system bids for you automatically.',
              },
              {
                step: '03',
                icon: Shield,
                title: 'Collect',
                description: 'Win your lot, pay securely via Stripe, and receive your item with insured shipping. Every piece AI-authenticated.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center group">
                <div className="w-16 h-16 rounded-2xl bg-champagne/10 flex items-center justify-center mx-auto mb-6 group-hover:bg-champagne/20 transition-colors duration-300">
                  <item.icon className="h-7 w-7 text-champagne" />
                </div>
                <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">{item.step}</span>
                <h3 className="font-display text-xl mt-2 mb-3">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: 'AI', label: 'Powered Cataloging' },
            { value: 'Live', label: 'Streaming Auctions' },
            { value: '24/7', label: 'Online Bidding' },
            { value: '100%', label: 'Secure Payments' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-display text-display-md text-champagne">{stat.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-charcoal text-white py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Consignment</span>
          <h2 className="font-display text-display-md text-white mt-2 mb-4">Ready to Sell?</h2>
          <p className="text-white/50 max-w-lg mx-auto mb-10 text-[15px] leading-relaxed">
            Have an extraordinary item? Our AI appraisal system provides instant estimates.
            Submit your piece for consignment and reach collectors worldwide.
          </p>
          <Link href="/consign/new">
            <Button variant="champagne" size="xl">
              Submit for Consignment
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
