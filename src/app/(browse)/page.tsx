import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const categories = [
  { name: 'Art', slug: 'art', description: 'Contemporary, Modern, and Old Masters' },
  { name: 'Antiques', slug: 'antiques', description: 'Fine antiques and period furniture' },
  { name: 'Luxury', slug: 'luxury', description: 'Watches, cars, and rare collectibles' },
  { name: 'Fashion', slug: 'fashion', description: 'Haute couture, vintage, and accessories' },
  { name: 'Jewelry', slug: 'jewelry', description: 'Fine jewelry and precious stones' },
  { name: 'Design', slug: 'design', description: 'Furniture, lighting, and objects' },
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

export default function HomePage() {
  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero */}
      <section className="relative bg-charcoal text-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
          <div className="max-w-2xl">
            <h1 className="font-display text-display-xl md:text-[4.5rem] leading-[1.05] tracking-tight">
              The Auction House
              <br />
              <span className="text-champagne">of the Future</span>
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-lg">
              AI-powered luxury auctions for art, antiques, fashion, jewelry, and design.
              Discover extraordinary objects from around the world.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/auctions">
                <Button size="lg" className="bg-champagne text-charcoal hover:bg-champagne/90">
                  Browse Auctions
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10">
                  Create Account
                </Button>
              </Link>
            </div>
          </div>
        </div>
        {/* Decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-charcoal via-charcoal/95 to-charcoal/70 pointer-events-none" />
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="font-display text-display-md">Browse by Category</h2>
            <p className="text-muted-foreground mt-2">Explore our curated collections</p>
          </div>
          <Link href="/lots" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
            View all lots <ArrowRight className="inline h-4 w-4 ml-1" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="group relative aspect-[3/4] bg-muted rounded-lg overflow-hidden flex items-end p-4"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-charcoal/20 to-transparent" />
              <div className="relative z-10">
                <h3 className="font-display text-lg text-white group-hover:text-champagne transition-colors">
                  {cat.name}
                </h3>
                <p className="text-xs text-white/60 mt-0.5 hidden sm:block">{cat.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-ivory dark:bg-card py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-display-md text-center mb-12">How Mayells Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                step: '01',
                title: 'Discover',
                description: 'Browse curated auctions across art, antiques, fashion, jewelry, and design. AI-powered recommendations surface lots you will love.',
              },
              {
                step: '02',
                title: 'Bid',
                description: 'Place bids in real-time on timed online auctions. Set maximum bids and our system bids for you. Anti-snipe protection ensures fair endings.',
              },
              {
                step: '03',
                title: 'Collect',
                description: 'Win your lot, pay securely via Stripe, and receive your item with insured shipping. Build your collection with confidence.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <span className="font-display text-display-lg text-champagne">{item.step}</span>
                <h3 className="font-display text-xl mt-2 mb-3">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 text-center">
        <h2 className="font-display text-display-md mb-4">Ready to Consign?</h2>
        <p className="text-muted-foreground max-w-lg mx-auto mb-8">
          Have an extraordinary item to sell? Our AI-powered appraisal system provides instant estimates. Submit your item for consignment today.
        </p>
        <Link href="/consign/new">
          <Button size="lg" className="bg-champagne text-charcoal hover:bg-champagne/90">
            Submit for Consignment
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </section>
    </div>
  );
}
