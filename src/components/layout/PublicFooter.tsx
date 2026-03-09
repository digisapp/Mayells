import Link from 'next/link';
import { NewsletterSignup } from '@/components/layout/NewsletterSignup';

export function PublicFooter() {
  return (
    <footer className="relative bg-charcoal text-white mt-12 sm:mt-20">
      <div className="absolute top-0 left-0 right-0 gradient-line" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-10">
          <div className="col-span-2 sm:col-span-2 lg:col-span-1">
            <h3 className="font-logo text-xl mb-1">MAYELL</h3>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/60 mb-3">Fine Art Antiques Design Fashion Collectibles</p>
            <p className="text-sm text-white/70 leading-relaxed mb-4">
              Luxury auctions and private sales for fine art, antiques, jewelry, watches, and design.
            </p>
            <NewsletterSignup />
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-white/60 mb-4">Browse</h4>
            <ul className="space-y-2.5 text-sm text-white/80">
              <li><Link href="/gallery" className="hover:text-champagne transition-colors duration-300">Gallery</Link></li>
              <li><Link href="/lots" className="hover:text-champagne transition-colors duration-300">Browse Lots</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-white/60 mb-4">Selling</h4>
            <ul className="space-y-2.5 text-sm text-white/80">
              <li><Link href="/consign" className="hover:text-champagne transition-colors duration-300">Consign With Us</Link></li>
              <li><Link href="/about" className="hover:text-champagne transition-colors duration-300">About Mayell</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-white/60 mb-4">Legal</h4>
            <ul className="space-y-2.5 text-sm text-white/80">
              <li><Link href="/terms" className="hover:text-champagne transition-colors duration-300">Terms of Service</Link></li>
              <li><Link href="/privacy" className="hover:text-champagne transition-colors duration-300">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 mt-8 sm:mt-12 pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <p className="text-[12px] sm:text-[13px] text-white/60">
            &copy; {new Date().getFullYear()} Mayell. All rights reserved.
          </p>
          <div className="flex gap-6 text-[13px] text-white/60">
            <Link href="/terms" className="hover:text-champagne transition-colors duration-300">Terms</Link>
            <Link href="/privacy" className="hover:text-champagne transition-colors duration-300">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
