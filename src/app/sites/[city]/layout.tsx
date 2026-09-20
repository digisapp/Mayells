import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Phone } from 'lucide-react';
import { Toaster } from 'sonner';
import { BUSINESS } from '@/lib/config';
import { getMicrositeBySlug, MICROSITE_SLUGS } from '@/lib/microsites/config';

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
 * page exists for, which is start a consignment conversation.
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
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/" className="flex flex-col justify-center py-1 leading-none">
            <span className="font-display text-xl tracking-tight">Mayells</span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {site.city}, {site.state}
            </span>
          </Link>
          <a
            href={BUSINESS.phoneHref}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-[15px] font-semibold transition-colors hover:bg-secondary"
          >
            <Phone className="h-4 w-4" />
            <span className="tabular-nums">{BUSINESS.phone}</span>
          </a>
        </div>
      </header>

      {children}

      <footer className="border-t border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <p className="font-display text-xl tracking-tight">Mayells</p>
              {/*
                Deliberately claims no licence or street address. Mayells holds
                neither on the public record we control, and a regulatory claim
                on a consignment page is not the place to be approximate.
              */}
              <p className="mt-2.5 text-[14px] leading-relaxed text-muted-foreground">
                {site.brand} is the {site.city} practice of Mayells, an auction house serving Palm
                Beach County and New York. Consignments are catalogued and sold through mayells.com.
              </p>
              <a
                href={BUSINESS.phoneHref}
                className="mt-5 inline-flex h-11 items-center gap-2 text-[16px] font-semibold tabular-nums"
              >
                <Phone className="h-4 w-4" />
                {BUSINESS.phone}
              </a>
            </div>
            <nav className="flex flex-col">
              {footerLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="flex h-11 items-center text-[14.5px] hover:underline"
                >
                  {l.label}
                </a>
              ))}
              <a
                href={`mailto:${BUSINESS.email}`}
                className="flex h-11 items-center text-[14.5px] hover:underline"
              >
                {BUSINESS.email}
              </a>
            </nav>
          </div>
          <div className="mt-8 flex flex-col gap-1 border-t border-border pt-4 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p className="flex h-11 items-center">&copy; {new Date().getFullYear()} Mayells. All rights reserved.</p>
            <div className="flex gap-5">
              <a href={`${BUSINESS.url}/terms`} className="flex h-11 items-center hover:underline">Terms</a>
              <a href={`${BUSINESS.url}/privacy`} className="flex h-11 items-center hover:underline">Privacy</a>
              <a href={BUSINESS.url} className="flex h-11 items-center hover:underline">mayells.com</a>
            </div>
          </div>
        </div>
      </footer>
      <Toaster position="top-center" />
    </div>
  );
}
