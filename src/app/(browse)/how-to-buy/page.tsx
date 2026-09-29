// Marketing/FAQ content — cache for an hour.
export const revalidate = 3600;

import Link from 'next/link';
import { Monitor, Phone, FileText, ArrowRight } from 'lucide-react';
import { BUSINESS } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { serializeJsonLd } from '@/lib/seo/structured-data';

export const metadata = {
  title: 'How to Buy',
  description: 'Three ways to bid at Mayells auctions: online on mayells.com or LiveAuctioneers (each sale says which), by phone, or with an absentee bid. Free to register.',
};

// Each sale is bid in one place (lib/bidding/venue.ts); the copy here and the
// conditions of sale on /terms describe that same rule.
const faqData = [
  { q: 'Where do I bid?', a: 'Each sale is bid in one place: here on mayells.com, or on LiveAuctioneers. The sale page says which, and links you straight there. The same lot is never open for bidding in both places at once.' },
  { q: 'Is there a buyer\'s premium?', a: 'Yes. A buyer\'s premium is added to the hammer price: 25% unless the sale page states a different rate. Sales bid on LiveAuctioneers may also carry LiveAuctioneers\' own fees, shown on its site.' },
  { q: 'Can I preview items in person?', a: 'Preview dates, when a sale has them, are listed on its auction page. Contact us to arrange a private viewing.' },
  { q: 'Do you ship internationally?', a: 'We ship worldwide through trusted fine art and antique shipping partners. Shipping costs are calculated after the sale. Local pickup is also available by appointment.' },
  { q: 'Can I request a condition report?', a: 'Absolutely. Contact us for detailed condition reports and additional photographs on any lot. We\'re happy to provide as much information as you need.' },
  { q: 'What if I can\'t bid live?', a: 'Leave a maximum bid in advance wherever the sale is bid (mayells.com or LiveAuctioneers) and it will bid for you only as high as needed. You can also call or email us to arrange phone bidding or an absentee bid.' },
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }} />
      {/* Hero */}
      <section className="bg-charcoal text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 md:py-28">
          <div className="max-w-2xl">
            <span className="text-eyebrow text-champagne">
              Buyers
            </span>
            <h1 className="font-display text-display-xl md:text-[4rem] leading-[1.05] tracking-tight mt-4">
              How to Buy<br />
              <span className="text-champagne">at Mayells</span>
            </h1>
            <p className="mt-5 sm:mt-6 text-[16px] sm:text-[17px] text-white/60 max-w-lg leading-relaxed">
              Every Mayells sale is bid online in one place: here on mayells.com, or on
              LiveAuctioneers. Each sale page tells you which, and takes you straight there.
            </p>
            <div className="mt-8">
              <Button asChild variant="champagne" size="lg">
                <Link href="/auctions">
                  View Auctions
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Ways to Bid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 md:py-28">
        <div className="text-center mb-8 sm:mb-16">
          <span className="text-eyebrow text-champagne-deep">
            Three Ways to Bid
          </span>
          <h2 className="font-display text-display-md mt-2">Choose How You Participate</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
          {/* Online */}
          <div className="border border-border/60 rounded-2xl p-6 sm:p-8 hover:border-champagne/40 transition-colors">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-champagne/10 flex items-center justify-center mb-5 sm:mb-6">
              <Monitor className="h-7 w-7 text-champagne-deep" />
            </div>
            <h3 className="font-display text-xl mb-3">Bid Online</h3>
            <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
              Bid from anywhere in the world, live or in advance. Each sale is bid either
              here on mayells.com or on LiveAuctioneers; the sale page says which.
            </p>
            <ol className="space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <span className="text-champagne-deep font-display">1</span>
                Open the sale and check where it&rsquo;s bid
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-champagne-deep font-display">2</span>
                Create a free account there (Mayells or LiveAuctioneers)
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-champagne-deep font-display">3</span>
                Bid live, or leave a maximum bid in advance
              </li>
            </ol>
          </div>

          {/* Phone */}
          <div className="border border-border/60 rounded-2xl p-6 sm:p-8 hover:border-champagne/40 transition-colors">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-champagne/10 flex items-center justify-center mb-5 sm:mb-6">
              <Phone className="h-7 w-7 text-champagne-deep" />
            </div>
            <h3 className="font-display text-xl mb-3">Bid by Phone</h3>
            <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
              Prefer a personal touch? Arrange for a Mayells representative to call
              you during the auction so you can bid live over the phone.
            </p>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Contact us at least 24 hours before the auction to arrange phone bidding.
              </p>
              <a
                href={BUSINESS.phoneHref}
                className="inline-flex items-center gap-2 min-h-11 text-champagne-deep underline-offset-4 hover:underline font-medium break-all"
              >
                <Phone className="h-4 w-4" />
                {BUSINESS.phone}
              </a>
            </div>
          </div>

          {/* Absentee */}
          <div className="border border-border/60 rounded-2xl p-6 sm:p-8 hover:border-champagne/40 transition-colors">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-champagne/10 flex items-center justify-center mb-5 sm:mb-6">
              <FileText className="h-7 w-7 text-champagne-deep" />
            </div>
            <h3 className="font-display text-xl mb-3">Leave an Absentee Bid</h3>
            <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
              Can&apos;t attend? Leave your maximum bid with us and we&apos;ll bid on your
              behalf, only going as high as necessary to win.
            </p>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Leave a maximum bid wherever the sale is bid, or send it to us by email or phone.
              </p>
              <a
                href={`mailto:${BUSINESS.email}?subject=Absentee Bid Request`}
                className="inline-flex items-center gap-2 min-h-11 text-champagne-deep underline-offset-4 hover:underline font-medium break-all"
              >
                {BUSINESS.email}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-secondary/40 py-14 sm:py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="font-display text-display-md">Common Questions</h2>
          </div>
          <div className="space-y-4 sm:space-y-6">
            {faqData.map((faq) => (
              <div key={faq.q} className="border border-border/60 rounded-xl p-5 sm:p-6">
                <h3 className="font-display text-base mb-2">{faq.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 text-center">
        <h2 className="font-display text-display-md mb-4">Ready to Start Bidding?</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Browse our upcoming auctions and find something extraordinary.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="champagne" size="lg">
            <Link href="/auctions">
              View Auctions
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
        <p className="mt-6 text-sm text-muted-foreground">
          Looking for something to buy today?{' '}
          <Link
            href="/gallery"
            className="inline-flex min-h-11 items-center font-medium text-champagne-deep underline-offset-4 hover:underline"
          >
            Browse the gallery
          </Link>
        </p>
      </section>
    </div>
  );
}
