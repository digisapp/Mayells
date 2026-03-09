import Link from 'next/link';
import { Monitor, Phone, FileText, ArrowRight, ExternalLink } from 'lucide-react';
import { BUSINESS } from '@/lib/config';

export const metadata = {
  title: 'How to Buy',
  description: 'Three ways to bid at Mayell auctions: online through LiveAuctioneers, by phone, or via absentee bid. Free to register, 25% buyer premium.',
};

const faqData = [
  { q: 'Do I need an account to bid?', a: 'Yes — you\'ll need a free LiveAuctioneers account. Registration takes less than a minute.' },
  { q: 'Is there a buyer\'s premium?', a: 'Yes, a 25% buyer\'s premium is added to the hammer price. This is standard practice in the auction industry.' },
  { q: 'How do I pay for items I win?', a: 'Payment is processed securely through LiveAuctioneers. They accept credit cards, wire transfers, and other payment methods.' },
  { q: 'How do I receive my items?', a: 'We offer shipping worldwide through trusted partners. Local pickup is also available by appointment. Shipping costs are calculated after the sale.' },
  { q: 'Can I preview items before the auction?', a: 'Yes — preview dates are listed on each auction page. Contact us to schedule an in-person preview appointment.' },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map((faq) => ({
    '@type': 'Question',
    name: faq.q,
    acceptedAnswer: { '@type': 'Answer', text: faq.a },
  })),
};

export default function HowToBuyPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      {/* Hero */}
      <section className="bg-charcoal text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-2xl">
            <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">
              Buyers
            </span>
            <h1 className="font-display text-display-xl md:text-[4rem] leading-[1.05] tracking-tight mt-4">
              How to Buy<br />
              <span className="text-champagne">at Mayell</span>
            </h1>
            <p className="mt-6 text-[17px] text-white/60 max-w-lg leading-relaxed">
              Bidding is easy. Our auctions are hosted on LiveAuctioneers, giving you
              access to a trusted global platform with secure payments and buyer protection.
            </p>
            <div className="mt-8">
              <a
                href="https://www.liveauctioneers.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-champagne text-charcoal hover:bg-champagne/90 rounded-lg px-6 py-3 text-sm font-medium transition-colors"
              >
                Visit LiveAuctioneers
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Ways to Bid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="text-center mb-16">
          <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">
            Three Ways to Bid
          </span>
          <h2 className="font-display text-display-md mt-2">Choose How You Participate</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Online */}
          <div className="border border-border/60 rounded-2xl p-8 hover:border-champagne/40 transition-colors">
            <div className="w-14 h-14 rounded-xl bg-champagne/10 flex items-center justify-center mb-6">
              <Monitor className="h-7 w-7 text-champagne" />
            </div>
            <h3 className="font-display text-xl mb-3">Bid Online</h3>
            <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
              Bid live or in advance through LiveAuctioneers. Create a free account,
              browse our catalog, and place bids from anywhere in the world.
            </p>
            <ol className="space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <span className="text-champagne font-display">1</span>
                Create a free LiveAuctioneers account
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-champagne font-display">2</span>
                Browse our upcoming auctions
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-champagne font-display">3</span>
                Place your bid — live or in advance
              </li>
            </ol>
          </div>

          {/* Phone */}
          <div className="border border-border/60 rounded-2xl p-8 hover:border-champagne/40 transition-colors">
            <div className="w-14 h-14 rounded-xl bg-champagne/10 flex items-center justify-center mb-6">
              <Phone className="h-7 w-7 text-champagne" />
            </div>
            <h3 className="font-display text-xl mb-3">Bid by Phone</h3>
            <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
              Prefer a personal touch? Arrange for a Mayell representative to call
              you during the auction so you can bid live over the phone.
            </p>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Contact us at least 24 hours before the auction to arrange phone bidding.
              </p>
              <a
                href={BUSINESS.phoneHref}
                className="inline-flex items-center gap-2 text-champagne hover:underline font-medium"
              >
                <Phone className="h-4 w-4" />
                {BUSINESS.phone}
              </a>
            </div>
          </div>

          {/* Absentee */}
          <div className="border border-border/60 rounded-2xl p-8 hover:border-champagne/40 transition-colors">
            <div className="w-14 h-14 rounded-xl bg-champagne/10 flex items-center justify-center mb-6">
              <FileText className="h-7 w-7 text-champagne" />
            </div>
            <h3 className="font-display text-xl mb-3">Leave an Absentee Bid</h3>
            <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
              Can&apos;t attend? Leave your maximum bid with us and we&apos;ll bid on your
              behalf, only going as high as necessary to win.
            </p>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Submit absentee bids through LiveAuctioneers, by phone, or via our chat.
              </p>
              <a
                href={`mailto:${BUSINESS.email}?subject=Absentee Bid Request`}
                className="inline-flex items-center gap-2 text-champagne hover:underline font-medium"
              >
                {BUSINESS.email}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-secondary/40 py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-display text-display-md">Common Questions</h2>
          </div>
          <div className="space-y-6">
            {faqData.map((faq) => (
              <div key={faq.q} className="border border-border/60 rounded-xl p-6">
                <h3 className="font-display text-base mb-2">{faq.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="font-display text-display-md mb-4">Ready to Start Bidding?</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Browse our upcoming auctions and find something extraordinary.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/gallery"
            className="inline-flex items-center justify-center gap-2 bg-champagne text-charcoal hover:bg-champagne/90 rounded-lg px-8 py-3 text-sm font-medium transition-colors"
          >
            Browse Gallery
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href={BUSINESS.phoneHref}
            className="inline-flex items-center justify-center gap-2 border border-border rounded-lg px-8 py-3 text-sm font-medium hover:bg-secondary/50 transition-colors"
          >
            <Phone className="h-4 w-4" />
            {BUSINESS.phone}
          </a>
        </div>
      </section>
    </div>
  );
}
