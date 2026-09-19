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
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/" className="group flex flex-col leading-none">
            <span className="font-display text-lg tracking-tight">Mayells</span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {site.city}, {site.state}
            </span>
          </Link>
          <a
            href={BUSINESS.phoneHref}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3.5 py-2 text-[13px] font-medium transition-colors hover:bg-secondary"
          >
            <Phone className="h-3.5 w-3.5" />
            <span className="tabular-nums">{BUSINESS.phone}</span>
          </a>
        </div>
      </header>

      {children}

      <footer className="border-t border-border bg-secondary/40">
        <div className="mx-auto max-w-5xl px-5 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <p className="font-display text-lg tracking-tight">Mayells</p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {site.brand} is the {site.city} practice of Mayells, a licensed auction house serving
                Palm Beach County and New York. Consignments are catalogued and sold through
                mayells.com.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 text-[13px]">
              <a href={BUSINESS.phoneHref} className="tabular-nums hover:underline">
                {BUSINESS.phone}
              </a>
              <a href={`mailto:${BUSINESS.email}`} className="hover:underline">
                {BUSINESS.email}
              </a>
              <a href={`${BUSINESS.url}/auctions`} className="hover:underline">
                Current auctions
              </a>
              <a href={`${BUSINESS.url}/consign`} className="hover:underline">
                How consignment works
              </a>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-2 border-t border-border pt-5 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; {new Date().getFullYear()} Mayells. All rights reserved.</p>
            <div className="flex gap-4">
              <a href={`${BUSINESS.url}/terms`} className="hover:underline">Terms</a>
              <a href={`${BUSINESS.url}/privacy`} className="hover:underline">Privacy</a>
              <a href={BUSINESS.url} className="hover:underline">mayells.com</a>
            </div>
          </div>
        </div>
      </footer>
      <Toaster position="top-center" />
    </div>
  );
}
