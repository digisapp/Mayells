import Link from 'next/link';
import { ArrowRight, Phone, Mail } from 'lucide-react';
import { BUSINESS } from '@/lib/config';

export const metadata = { title: 'About | Mayell' };

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-charcoal text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-2xl">
            <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">
              About Us
            </span>
            <h1 className="font-display text-display-xl md:text-[4rem] leading-[1.05] tracking-tight mt-4">
              About<br />
              <span className="text-champagne">Mayell</span>
            </h1>
            <p className="mt-6 text-[17px] text-white/60 max-w-lg leading-relaxed">
              A luxury auction house specializing in consignment sales of fine art,
              antiques, jewelry, watches, fashion, design, and collectibles.
            </p>
          </div>
        </div>
      </section>

      {/* Who We Are */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-display-md mb-6">Who We Are</h2>
          <div className="space-y-5 text-[15px] text-muted-foreground leading-relaxed">
            <p>
              Mayell is a full-service auction house that connects sellers with buyers
              worldwide through the LiveAuctioneers platform. We handle every step of the
              process — from appraisal and cataloging to marketing, auctioning, and payment.
            </p>
            <p>
              Whether you&apos;re downsizing an estate, liquidating a collection, or selling
              a single exceptional piece, our team provides expert guidance and transparent
              service to maximize the value of your consignment.
            </p>
            <p>
              Our auctions are hosted on LiveAuctioneers, one of the world&apos;s most
              trusted online auction platforms, giving your items exposure to millions of
              registered bidders across the globe.
            </p>
          </div>
        </div>
      </section>

      {/* What We Handle */}
      <section className="bg-secondary/40 py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">
              Categories
            </span>
            <h2 className="font-display text-display-md mt-2">What We Auction</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              'Fine Art',
              'Antiques',
              'Jewelry',
              'Watches',
              'Fashion & Accessories',
              'Design & Furniture',
              'Collectibles',
              'Estates',
            ].map((cat) => (
              <div
                key={cat}
                className="border border-border/60 rounded-xl p-5 text-center hover:border-champagne/40 transition-colors"
              >
                <p className="font-display text-sm">{cat}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact + CTAs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-display-md mb-4">Get in Touch</h2>
          <p className="text-muted-foreground mb-8">
            Have questions about selling or buying? We&apos;re here to help.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <a
              href={BUSINESS.phoneHref}
              className="inline-flex items-center gap-2 text-sm font-medium hover:text-champagne transition-colors"
            >
              <Phone className="h-4 w-4" />
              {BUSINESS.phone}
            </a>
            <span className="hidden sm:inline text-border">|</span>
            <a
              href={`mailto:${BUSINESS.email}`}
              className="inline-flex items-center gap-2 text-sm font-medium hover:text-champagne transition-colors"
            >
              <Mail className="h-4 w-4" />
              {BUSINESS.email}
            </a>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/consign"
              className="inline-flex items-center justify-center gap-2 bg-champagne text-charcoal hover:bg-champagne/90 rounded-lg px-8 py-3 text-sm font-medium transition-colors"
            >
              Consign With Us
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/auctions"
              className="inline-flex items-center justify-center gap-2 border border-border rounded-lg px-8 py-3 text-sm font-medium hover:bg-secondary/50 transition-colors"
            >
              View Auctions
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
