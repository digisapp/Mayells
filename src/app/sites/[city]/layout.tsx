import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Phone } from 'lucide-react';
import { BUSINESS } from '@/lib/config';
import { getMicrositeBySlug, MICROSITE_SLUGS } from '@/lib/microsites/config';
import { CallLink } from '@/components/microsites/CallLink';

export function generateStaticParams() {
  return MICROSITE_SLUGS.map((city) => ({ city }));
}

const footerLinks = [
  { href: `${BUSINESS.url}/auctions`, label: 'Current auctions' },
  { href: `${BUSINESS.url}/consign`, label: 'How consignment works' },
  { href: `${BUSINESS.url}/how-to-buy`, label: 'How to buy' },
  { href: `${BUSINESS.url}/about`, label: 'About Mayells' },
];

/**
 * Microsites get their own chrome rather than the main site's nav and footer:
 * a city landing page carrying the full catalogue navigation invites the
 * visitor to leave for mayells.com before they have done the one thing the
 * page exists for, which is start a consignment conversation. The chrome
 * still speaks the main site's language — the tracked MAYELLS wordmark, the
 * charcoal footer with its champagne rule — so the two read as one brand.
 *
 * No <Toaster> here: the root layout already mounts one, and sonner renders
 * every toast once per mounted Toaster.
 */
export default async function MicrositeLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const site = getMicrositeBySlug(city);
  if (!site) notFound();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:h-[72px]">
          <Link href="/" className="flex min-h-11 flex-col justify-center leading-none">
            <span className="font-logo text-[19px] tracking-[0.15em] sm:text-[21px]">MAYELLS</span>
            <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {site.city}, {site.state}
            </span>
          </Link>
          <div className="flex items-center gap-2.5">
            <CallLink
              href={BUSINESS.phoneHref}
              site={site.slug}
              placement="header"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-[15px] font-semibold transition-colors hover:bg-secondary"
            >
              <Phone className="h-4 w-4" />
              <span className="tabular-nums">{BUSINESS.phone}</span>
            </CallLink>
            {/*
              Desktop gets its persistent call to action here; phones have the
              sticky bottom bar instead, so this stays hidden below lg to keep
              the header to one row.
            */}
            <a
              href="#appraisal"
              className="hidden h-11 items-center gap-2 rounded-lg bg-champagne px-4 text-[15px] font-semibold text-charcoal transition-colors hover:bg-champagne/90 lg:inline-flex"
            >
              Free appraisal
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      {children}

      <footer className="relative bg-charcoal text-white">
        <div className="absolute inset-x-0 top-0 gradient-line" />
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <p className="font-logo text-2xl tracking-[0.15em]">MAYELLS</p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-champagne/90">
                {site.city}, {site.state}
              </p>
              {/*
                Deliberately claims no licence or street address. Mayells holds
                neither on the public record we control, and a regulatory claim
                on a consignment page is not the place to be approximate.
              */}
              <p className="mt-4 text-[14px] leading-relaxed text-white/60">
                {site.brand} is the {site.city} practice of Mayells, an auction house serving Palm
                Beach County and New York. Consignments are catalogued and sold through mayells.com.
              </p>
              <CallLink
                href={BUSINESS.phoneHref}
                site={site.slug}
                placement="footer"
                className="mt-5 inline-flex h-11 items-center gap-2 text-[16px] font-semibold tabular-nums text-white transition-colors hover:text-champagne"
              >
                <Phone className="h-4 w-4" />
                {BUSINESS.phone}
              </CallLink>
            </div>
            <nav className="flex flex-col">
              {footerLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="flex h-11 items-center text-[14.5px] text-white/70 transition-colors hover:text-champagne"
                >
                  {l.label}
                </a>
              ))}
              <a
                href={`mailto:${BUSINESS.email}`}
                className="flex h-11 items-center text-[14.5px] text-white/70 transition-colors hover:text-champagne"
              >
                {BUSINESS.email}
              </a>
            </nav>
          </div>
          <div className="mt-10 flex flex-col gap-1 border-t border-white/10 pt-4 text-[12.5px] text-white/40 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex h-11 items-center">&copy; {new Date().getFullYear()} Mayells. All rights reserved.</p>
            <div className="flex gap-5">
              <a href={`${BUSINESS.url}/terms`} className="flex h-11 items-center hover:text-white/70">Terms</a>
              <a href={`${BUSINESS.url}/privacy`} className="flex h-11 items-center hover:text-white/70">Privacy</a>
              <a href={BUSINESS.url} className="flex h-11 items-center hover:text-white/70">mayells.com</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
