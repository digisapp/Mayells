import Link from 'next/link';
import { NewsletterSignup } from '@/components/layout/NewsletterSignup';
import { BUSINESS } from '@/lib/config';
import { MICROSITES } from '@/lib/microsites/config';

// Below lg the links are 40px touch rows; from lg they return to the compact
// 28px desktop rhythm.
const linkClass =
  'flex min-h-10 items-center lg:inline-block lg:min-h-0 lg:py-1 hover:text-champagne transition-colors duration-300';
const headingClass = 'text-[11px] uppercase tracking-[0.15em] font-semibold text-white/50 mb-1.5';

const auctionLinks = [
  { label: 'Current Sales', href: '/auctions' },
  { label: 'Browse Lots', href: '/lots' },
  { label: 'Gallery Shop', href: '/gallery' },
  { label: 'Search', href: '/search' },
  { label: 'How to Buy', href: '/how-to-buy' },
];

const sellingLinks = [
  { label: 'Consign With Us', href: '/consign' },
  { label: 'Free Appraisal', href: '/consign#submit-form' },
  { label: 'Consignment Agreement', href: '/consignment-agreement' },
];

const companyLinks = [
  { label: 'About', href: '/about' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
];

function LinkList({ links }: { links: { label: string; href: string }[] }) {
  return links.map((l) => (
    <li key={l.label}>
      <Link href={l.href} className={linkClass}>{l.label}</Link>
    </li>
  ));
}

/*
 * Phones get a tighter arrangement of the same links (one DOM, no
 * duplicates): Auctions and Selling side by side, the city practices as a
 * two-by-two block, and Company as a single row of links above the
 * copyright. From lg it is the five-column desktop footer as before.
 */
export function PublicFooter() {
  return (
    <footer className="relative bg-charcoal text-white">
      <div className="absolute top-0 left-0 right-0 gradient-line" />
      {/*
        Below lg the bottom padding clears the floating chat bubble (48px,
        bottom-right) plus a gap, so the last row is never under it when
        scrolled to the end. The first term is the bubble's own bottom offset:
        above any sticky action bar (--mobile-cta-bar, which already includes
        the home-indicator inset), else above the home indicator.
      */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16 lg:pt-20 pb-[calc(max(calc(var(--mobile-cta-bar,0px)+1rem),max(1rem,env(safe-area-inset-bottom)))+4.5rem)] lg:pb-20">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-6 gap-y-8 sm:gap-x-10 lg:gap-10">
          {/* Brand column */}
          <div className="col-span-2 lg:col-span-2">
            <h3 className="font-logo text-2xl tracking-[0.15em] mb-2">MAYELLS</h3>
            <p className="hidden sm:block text-eyebrow text-white/60 font-normal mb-4">Fine Art &middot; Antiques &middot; Jewelry &middot; Collectibles</p>
            <p className="text-sm text-white/60 leading-relaxed text-pretty mb-2 lg:mb-6 max-w-md lg:max-w-xs">
              Luxury auctions and private sales sourced from estates and private collections. Palm Beach and New York.
            </p>
            <div className="flex flex-wrap gap-x-6 lg:block text-sm text-white/60 mb-3 lg:mb-6">
              <a href={BUSINESS.phoneHref} className="flex min-h-11 items-center lg:block lg:min-h-0 lg:py-1 hover:text-champagne transition-colors">{BUSINESS.phone}</a>
              <a href={`mailto:${BUSINESS.email}`} className="flex min-h-11 items-center lg:block lg:min-h-0 lg:py-1 hover:text-champagne transition-colors">{BUSINESS.email}</a>
            </div>
            <NewsletterSignup />
          </div>

          <div>
            <h4 className={`${headingClass} lg:mb-5`}>Auctions</h4>
            <ul className="text-sm text-white/70 lg:space-y-1">
              <LinkList links={auctionLinks} />
            </ul>
          </div>

          <div>
            <h4 className={`${headingClass} lg:mb-5`}>Selling</h4>
            <ul className="text-sm text-white/70 lg:space-y-1">
              <LinkList links={sellingLinks} />
            </ul>
          </div>

          {/* Last on phones, as one row above the copyright; a column from lg. */}
          <div className="col-span-2 order-last -mt-4 lg:col-span-1 lg:order-none lg:mt-0">
            <h4 className={`${headingClass} sr-only lg:not-sr-only lg:mb-5`}>Company</h4>
            <ul className="flex flex-wrap gap-x-6 text-sm text-white/70 lg:block lg:space-y-1">
              <LinkList links={companyLinks} />
            </ul>
          </div>

          {/*
            City practices. These are the only crawlable links the microsites
            receive from the main brand; without them a new exact-match domain
            with one page has nothing pointing at it and may never be indexed.
          */}
          <div className="col-span-2 lg:col-span-5 lg:border-t lg:border-white/10 lg:pt-8 lg:mt-4">
            <h4 className={`${headingClass} lg:mb-3`}>Estate appraisals by area</h4>
            <ul className="grid grid-cols-2 gap-x-6 text-sm text-white/70 lg:flex lg:flex-wrap lg:gap-x-6 lg:gap-y-1">
              {MICROSITES.map((m) => (
                <li key={m.slug}>
                  <a href={`https://${m.domain}`} className={linkClass}>
                    {m.city}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar. Terms and Privacy live in the Company links above. */}
        <div className="border-t border-white/10 mt-6 pt-4 lg:mt-8 lg:pt-8">
          <p className="text-[12px] text-white/40">
            &copy; {new Date().getFullYear()} Mayells. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
