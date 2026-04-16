import Link from 'next/link';
import { NewsletterSignup } from '@/components/layout/NewsletterSignup';
import { BUSINESS } from '@/lib/config';

export function PublicFooter() {
  return (
    <footer className="relative bg-charcoal text-white">
      <div className="absolute top-0 left-0 right-0 gradient-line" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-8 sm:gap-10">
          {/* Brand column */}
          <div className="col-span-2 lg:col-span-2">
            <h3 className="font-logo text-2xl tracking-[0.15em] mb-2">MAYELL</h3>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/50 mb-4">Fine Art &middot; Antiques &middot; Jewelry &middot; Collectibles</p>
            <p className="text-sm text-white/60 leading-relaxed mb-6 max-w-xs">
              Luxury auctions and private sales sourced from estates and private collections. Boca Raton and New York.
            </p>
            <div className="space-y-2 text-sm text-white/60 mb-6">
              <a href={BUSINESS.phoneHref} className="block hover:text-champagne transition-colors">{BUSINESS.phone}</a>
              <a href={`mailto:${BUSINESS.email}`} className="block hover:text-champagne transition-colors">{BUSINESS.email}</a>
            </div>
            <NewsletterSignup />
          </div>

          {/* Auctions */}
          <div>
            <h4 className="text-[11px] uppercase tracking-[0.15em] font-semibold text-white/50 mb-5">Auctions</h4>
            <ul className="space-y-3 text-sm text-white/70">
              <li><Link href="/auctions" className="hover:text-champagne transition-colors duration-300">Current Sales</Link></li>
              <li><Link href="/lots" className="hover:text-champagne transition-colors duration-300">Browse Lots</Link></li>
              <li><Link href="/gallery" className="hover:text-champagne transition-colors duration-300">Gallery Shop</Link></li>
              <li><Link href="/search" className="hover:text-champagne transition-colors duration-300">Search</Link></li>
              <li><Link href="/how-to-buy" className="hover:text-champagne transition-colors duration-300">How to Buy</Link></li>
            </ul>
          </div>

          {/* Selling */}
          <div>
            <h4 className="text-[11px] uppercase tracking-[0.15em] font-semibold text-white/50 mb-5">Selling</h4>
            <ul className="space-y-3 text-sm text-white/70">
              <li><Link href="/consign" className="hover:text-champagne transition-colors duration-300">Consign With Us</Link></li>
              <li><Link href="/consign" className="hover:text-champagne transition-colors duration-300">Free Appraisal</Link></li>
              <li><Link href="/consignment-agreement" className="hover:text-champagne transition-colors duration-300">Consignment Agreement</Link></li>
              <li><Link href="/about" className="hover:text-champagne transition-colors duration-300">About Us</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-[11px] uppercase tracking-[0.15em] font-semibold text-white/50 mb-5">Company</h4>
            <ul className="space-y-3 text-sm text-white/70">
              <li><Link href="/about" className="hover:text-champagne transition-colors duration-300">About</Link></li>
              <li><Link href="/terms" className="hover:text-champagne transition-colors duration-300">Terms of Service</Link></li>
              <li><Link href="/privacy" className="hover:text-champagne transition-colors duration-300">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 mt-10 sm:mt-14 pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <p className="text-[12px] text-white/40">
            &copy; {new Date().getFullYear()} Mayells. All rights reserved.
          </p>
          <div className="flex gap-6 text-[12px] text-white/40">
            <Link href="/terms" className="hover:text-white/60 transition-colors duration-300">Terms</Link>
            <Link href="/privacy" className="hover:text-white/60 transition-colors duration-300">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
