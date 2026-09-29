import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Phone, Mail } from 'lucide-react';
import { BUSINESS } from '@/lib/config';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'About',
  description: 'Mayells is a full-service auction house in Palm Beach, Florida and New York specializing in consignment sales of fine art, antiques, jewelry, watches, fashion, and collectibles.',
};

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-charcoal text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 md:py-28">
          <div className="max-w-2xl">
            <span className="text-eyebrow text-champagne">
              About Us
            </span>
            <h1 className="font-display text-display-xl md:text-[4rem] leading-[1.05] tracking-tight mt-4">
              About<br />
              <span className="text-champagne">Mayells</span>
            </h1>
            <p className="mt-5 sm:mt-6 text-[16px] sm:text-[17px] text-white/60 max-w-lg leading-relaxed">
              A luxury auction house in Palm Beach, Florida and New York, specializing
              in consignment sales of fine art, antiques, jewelry, watches, fashion,
              design, and collectibles.
            </p>
          </div>
        </div>
      </section>

      {/* Who We Are */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 md:py-28">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-display-md mb-6">Who We Are</h2>
          <div className="space-y-5 text-[15px] text-muted-foreground leading-relaxed">
            <p>
              Mayells is a full-service online auction house that connects sellers with
              buyers worldwide. We handle every step of the process — from appraisal and
              cataloguing to marketing, auctioning, and payment.
            </p>
            <p>
              Whether you&apos;re downsizing an estate, liquidating a collection, or selling
              a single exceptional piece, our team provides expert guidance and transparent
              service to maximize the value of your consignment.
            </p>
            <p>
              Each sale is bid online in one place: here on mayells.com, or on
              LiveAuctioneers, one of the largest online auction marketplaces, when a sale
              calls for its international bidder audience. The sale page always says which.
            </p>
          </div>
        </div>
      </section>

      {/* What We Handle */}
      <section className="bg-secondary/40 py-14 sm:py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-12">
            <span className="text-eyebrow text-champagne-deep">
              Categories
            </span>
            <h2 className="font-display text-display-md mt-2">What We Auction</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto">
            {/* The home page's six department tiles, same labels, plus two
                entry points: decorative arts (catalogued under Antiques) and
                estates (consignment). */}
            {[
              { name: 'Fine Art', href: '/categories/art', image: '/images/categories/fine-art.webp' },
              { name: 'Antiques', href: '/categories/antiques', image: '/images/categories/antiques.webp' },
              { name: 'Jewelry', href: '/categories/jewelry', image: '/images/categories/jewelry.webp' },
              { name: 'Fashion & Accessories', href: '/categories/fashion', image: '/images/categories/fashion.webp' },
              { name: 'Watches & Luxury', href: '/categories/luxury', image: '/images/lots/patek-nautilus.webp' },
              { name: 'Design & Furniture', href: '/categories/design', image: '/images/categories/design.webp' },
              { name: 'Decorative Arts', href: '/categories/antiques', image: '/images/lots/meissen-tureen.webp' },
              { name: 'Estates', href: '/consign', image: '/images/lots/library-set.webp' },
            ].map((cat) => (
              <Link
                key={cat.name}
                href={cat.href}
                className="relative aspect-[4/3] rounded-xl overflow-hidden group outline-none focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Image
                  src={cat.image}
                  alt={cat.name}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3.5 sm:p-4">
                  <p className="font-display text-white text-[15px] sm:text-sm leading-snug">{cat.name}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Contact + CTAs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 md:py-28">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-display-md mb-4">Get in Touch</h2>
          <p className="text-muted-foreground mb-8">
            Have questions about selling or buying? We&apos;re here to help.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-4 mb-8 sm:mb-10">
            <a
              href={BUSINESS.phoneHref}
              className="inline-flex items-center gap-2 min-h-11 text-sm font-medium hover:text-champagne-deep transition-colors"
            >
              <Phone className="h-4 w-4" />
              {BUSINESS.phone}
            </a>
            <span className="hidden sm:inline text-border">|</span>
            <a
              href={`mailto:${BUSINESS.email}`}
              className="inline-flex items-center gap-2 min-h-11 text-sm font-medium hover:text-champagne-deep transition-colors"
            >
              <Mail className="h-4 w-4" />
              {BUSINESS.email}
            </a>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="champagne" size="lg">
              <Link href="/consign">
                Consign With Us
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/gallery">View Gallery</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
