'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LotGrid } from './LotGrid';
import {
  LOT_SORTS,
  applyBrowse,
  browseQuery,
  deriveDepartments,
  parseBrowseState,
  type BrowseLot,
  type BrowseState,
  type LotSort,
} from './lot-browser';

// The URL is the single source of truth for the filter (?dept=&sort=). The
// page is ISR-cached, so it is read on the client: the server snapshot is the
// default view, and React swaps in the URL's view right after hydration.
const URL_CHANGE_EVENT = 'mayells:lots-url';

function subscribeToUrl(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(URL_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(URL_CHANGE_EVENT, onChange);
  };
}
const getUrlSearch = () => window.location.search;
const getServerUrlSearch = () => '';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function LotBrowser({ lots }: { lots: BrowseLot[] }) {
  const search = useSyncExternalStore(subscribeToUrl, getUrlSearch, getServerUrlSearch);
  const state = useMemo(() => parseBrowseState(search), [search]);
  const departments = useMemo(() => deriveDepartments(lots), [lots]);
  const visible = useMemo(() => applyBrowse(lots, state), [lots, state]);
  const activeDept = departments.find((d) => d.slug === state.dept) ?? null;

  const barRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Keep the active chip in view inside the horizontal scroller (e.g. a shared
  // ?dept= link whose chip starts off-screen). Only scrolls the chip row.
  useEffect(() => {
    const scroller = chipsRef.current;
    const chip = scroller?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!scroller || !chip || scroller.scrollWidth <= scroller.clientWidth) return;
    scroller.scrollTo({
      left: chip.offsetLeft - (scroller.clientWidth - chip.offsetWidth) / 2,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [state.dept]);

  function update(next: Partial<BrowseState>) {
    const merged = { ...state, ...next };
    const url = `${window.location.pathname}${browseQuery(merged, window.location.search)}${window.location.hash}`;
    // replaceState, not a navigation: no RSC round trip and no history entry
    // per tap. Next.js syncs its router with native history calls.
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new Event(URL_CHANGE_EVENT));

    // If the reader has scrolled into the grid, bring them back to the first
    // result so the change is visible rather than happening off-screen.
    const results = resultsRef.current;
    const bar = barRef.current;
    if (results && bar) {
      const barBottom = bar.getBoundingClientRect().bottom;
      const resultsTop = results.getBoundingClientRect().top;
      if (resultsTop < barBottom) {
        window.scrollTo({
          top: window.scrollY + resultsTop - barBottom - 12,
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      }
    }
  }

  if (lots.length === 0) {
    return (
      <div className="text-center py-16 sm:py-20 border border-border/60 rounded-2xl">
        <p className="font-display text-display-sm">No lots are open right now</p>
        <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
          New sales are catalogued regularly. See what&apos;s coming up, or buy now from the gallery.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center px-6">
          <Button asChild variant="champagne" size="lg">
            <Link href="/auctions">View auctions</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/gallery">Shop the gallery</Link>
          </Button>
        </div>
      </div>
    );
  }

  const chipClass = (active: boolean) =>
    `shrink-0 inline-flex items-center gap-1.5 h-11 px-4 rounded-full border text-[14px] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
      active
        ? 'bg-foreground text-background border-foreground'
        : 'bg-background text-foreground/80 border-border hover:border-foreground/40 hover:text-foreground'
    }`;
  const countClass = (active: boolean) =>
    `text-[12px] tabular-nums ${active ? 'text-background/70' : 'text-muted-foreground'}`;

  return (
    <div>
      {/* Department chips: a sticky, horizontally scrolling row under the
          header on phones and tablets; a static wrapping row on desktop. */}
      <div
        ref={barRef}
        className="sticky top-16 sm:top-[72px] lg:static z-30 -mx-4 sm:-mx-6 lg:mx-0 bg-background/95 backdrop-blur-sm border-b border-border/60 lg:border-0 lg:bg-transparent lg:backdrop-blur-none"
      >
        <div
          ref={chipsRef}
          role="group"
          aria-label="Filter by department"
          className="relative flex gap-2 overflow-x-auto scrollbar-hide overscroll-x-contain px-4 sm:px-6 scroll-px-4 sm:scroll-px-6 py-2.5 lg:px-0 lg:py-0 lg:flex-wrap lg:overflow-visible"
        >
          <button type="button" aria-pressed={!state.dept} onClick={() => update({ dept: null })} className={chipClass(!state.dept)}>
            All lots <span className={countClass(!state.dept)}>{lots.length}</span>
          </button>
          {departments.map((dept) => {
            const active = dept.slug === state.dept;
            return (
              <button
                key={dept.slug}
                type="button"
                aria-pressed={active}
                onClick={() => update({ dept: active ? null : dept.slug })}
                className={chipClass(active)}
              >
                {dept.name} <span className={countClass(active)}>{dept.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 mt-4 mb-5 sm:mt-6 sm:mb-6">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {visible.length} lot{visible.length !== 1 ? 's' : ''}
          {activeDept ? <> in {activeDept.name}</> : null}
        </p>
        <label className="relative inline-flex items-center shrink-0">
          <span className="sr-only">Sort lots</span>
          {/* Native select: the iOS picker wheel, and 16px text so focusing it never zooms. */}
          <select
            value={state.sort}
            onChange={(e) => update({ sort: e.target.value as LotSort })}
            className="appearance-none h-11 rounded-full border border-border bg-background pl-4 pr-10 text-base text-foreground cursor-pointer outline-none transition-colors hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {LOT_SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 h-4 w-4 text-muted-foreground" />
        </label>
      </div>

      <div ref={resultsRef}>
        {visible.length > 0 ? (
          <LotGrid lots={visible} />
        ) : (
          <div className="text-center py-16 border border-border/60 rounded-2xl">
            <p className="font-display text-display-sm">No lots in this department right now</p>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto px-6">
              Try another department, or browse every lot in our current sales.
            </p>
            <Button variant="outline" size="lg" className="mt-6" onClick={() => update({ dept: null })}>
              Show all lots
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
