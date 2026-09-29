import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  /** Omit for the current page (the last crumb). */
  href?: string;
  /**
   * Drop this crumb (and its separator) on phones, so a crowded row keeps
   * the crumb that matters readable instead of truncating everything.
   */
  hideOnPhone?: boolean;
}

// Quiet by design: small muted text that only warms on hover. Links are
// 44px tall for touch; the negative margin keeps the row visually compact.
const linkClass =
  'inline-flex min-h-11 items-center hover:text-champagne-deep focus-visible:text-champagne-deep transition-colors';

/**
 * Visible breadcrumb trail for catalogue pages ("Auctions / Sale / Lot 12").
 * The matching BreadcrumbList JSON-LD stays with each page.
 */
export function Breadcrumbs({ items, className = '' }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`-my-2.5 min-w-0 text-[13px] text-muted-foreground ${className}`}>
      <ol className="flex min-w-0 items-center gap-x-2">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          // Only the middle crumbs (a long sale title) truncate; the root and
          // a short current crumb ("Lot 12") always stay readable. With two
          // crumbs the current one is a title, so it is the one to truncate.
          const shrinks = i > 0 && (!last || items.length === 2);
          return (
            <li
              key={`${item.label}-${i}`}
              className={`${item.hideOnPhone ? 'hidden sm:flex' : 'flex'} items-center gap-x-2 ${shrinks ? 'min-w-0' : 'shrink-0'}`}
            >
              {item.href && !last ? (
                <Link href={item.href} className={`${linkClass} min-w-0 sm:max-w-sm`}>
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className="inline-flex min-h-11 min-w-0 items-center text-foreground/80">
                  <span className="truncate">{item.label}</span>
                </span>
              )}
              {!last && <span aria-hidden className="text-muted-foreground/50">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * A single "← All auctions" style back link, same quiet treatment. A plain
 * wrapper, not a landmark: one link is not a breadcrumb trail.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="-my-2.5 text-[13px] text-muted-foreground">
      <Link href={href} className={`${linkClass} gap-1`}>
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        {label}
      </Link>
    </div>
  );
}

export interface SiblingLot {
  href: string;
  lotNumber: number;
  title: string;
}

/** Previous / next lot within a sale, in lot-number order. */
export function LotPager({ prev, next }: { prev: SiblingLot | null; next: SiblingLot | null }) {
  if (!prev && !next) return null;
  return (
    <nav aria-label="Lots in this sale" className="-my-2.5 flex shrink-0 items-center gap-x-4 text-[13px] text-muted-foreground">
      {prev ? (
        <Link href={prev.href} className={`${linkClass} gap-1`} title={prev.title} rel="prev">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          <span>
            <span className="sr-only">Previous: </span>Lot {prev.lotNumber}
          </span>
        </Link>
      ) : null}
      {prev && next && <span aria-hidden className="text-muted-foreground/50">|</span>}
      {next ? (
        <Link href={next.href} className={`${linkClass} gap-1`} title={next.title} rel="next">
          <span>
            <span className="sr-only">Next: </span>Lot {next.lotNumber}
          </span>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : null}
    </nav>
  );
}
