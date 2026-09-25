import Image from 'next/image';
import { Check } from 'lucide-react';

const POINTS = ['Bid in our online sales', 'Keep a watchlist of lots you love', 'Follow your bids and invoices'];

/**
 * Frame for the account pages (sign in, create account, password reset).
 * Phones get the form alone on the page; from sm it sits in a card, and from
 * lg the card gains an artwork panel saying what an account is for.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-8 pb-16 sm:px-6 sm:py-16 lg:py-20">
      <div className="mx-auto w-full max-w-md sm:rounded-2xl sm:bg-card sm:shadow-luxury sm:ring-1 sm:ring-black/5 lg:grid lg:max-w-5xl lg:grid-cols-2 lg:overflow-hidden">
        <aside className="relative hidden min-h-[38rem] bg-charcoal lg:block">
          {/* Henri Fantin-Latour, Still Life with Flowers and Fruit (1866). The
              Met, Open Access (CC0) — see public/images/credits.json. */}
          <Image
            src="/images/lots/still-life-anemones.webp"
            alt=""
            fill
            sizes="32rem"
            className="object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_top,oklch(0.18_0.02_250/0.95)_0%,oklch(0.18_0.02_250/0.7)_38%,oklch(0.18_0.02_250/0.05)_70%)]"
          />
          <div className="absolute inset-x-0 bottom-0 p-10 text-white">
            <p className="text-eyebrow text-champagne">Your Mayells account</p>
            <p className="mt-3 font-display text-[2rem] leading-tight">Bid, follow and collect</p>
            <ul className="mt-5 space-y-2.5">
              {POINTS.map((p) => (
                <li key={p} className="flex items-center gap-2.5 text-[15px] text-white/80">
                  <Check className="h-4 w-4 shrink-0 text-champagne" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </aside>
        <div className="flex flex-col justify-center sm:p-10 lg:px-14 lg:py-16">{children}</div>
      </div>
    </div>
  );
}

/** Shared heading block for the forms inside AuthShell. */
export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-[1.875rem] leading-tight tracking-tight">{title}</h1>
      {children && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  );
}

/** Error box for the auth forms: announced, and readable (red-800 on red-50). */
export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[14px] leading-relaxed text-red-800">
      {children}
    </div>
  );
}

/** Input height for the auth forms: 44px touch targets, not the 36px default. */
export const AUTH_INPUT = 'h-11';

/** Links on light backgrounds: champagne-deep holds ~4.8:1 where champagne is ~2:1. */
export const AUTH_LINK = 'font-medium text-champagne-deep underline-offset-4 hover:underline';
