'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  isLeadForm,
  resetFormStarts,
  sendFormStart,
  sendSiteEvent,
  setAnalyticsOptOut,
} from '@/lib/analytics/beacon';

/** Where on the page a phone number was tapped, when the link doesn't say. */
function landmark(el: Element): string {
  if (el.closest('header')) return 'header';
  if (el.closest('footer')) return 'footer';
  if (el.closest('nav')) return 'nav';
  return 'page';
}

/**
 * Records page views, phone-number taps and form starts on every public
 * page, for the admin Analytics page. Mounted once in the root layout, so
 * it covers mayells.com and the city domains alike; which site a hit
 * belongs to is decided on the server from the domain.
 *
 * Staff browsing their own site would swamp a small site's numbers, so a
 * browser that opens the admin stops counting. `?notrack` does the same on
 * a city domain (the admin is on another origin); `?notrack=0` undoes it.
 */
export function SiteTracker() {
  const pathname = usePathname();
  const lastCounted = useRef<string | null>(null);

  useEffect(() => {
    const notrack = new URLSearchParams(window.location.search).get('notrack');
    if (notrack !== null) setAnalyticsOptOut(notrack !== '0');
    if (pathname.startsWith('/admin')) {
      setAnalyticsOptOut(true);
      return;
    }
    // One view per page: an effect re-run for the same path (React runs
    // effects twice in development) must not count the page again.
    if (lastCounted.current === pathname) return;
    const nav = lastCounted.current !== null;
    lastCounted.current = pathname;
    resetFormStarts();
    sendSiteEvent('view', { nav });
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const link = e.target instanceof Element ? e.target.closest('a[href^="tel:"]') : null;
      if (!link) return;
      sendSiteEvent('call', { placement: link.getAttribute('data-call-placement') ?? landmark(link) });
    }
    function onFocusIn(e: FocusEvent) {
      const form = e.target instanceof Element ? e.target.closest('form') : null;
      if (form && isLeadForm(form)) sendFormStart('lead');
    }
    document.addEventListener('click', onClick, true);
    document.addEventListener('focusin', onFocusIn, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('focusin', onFocusIn, true);
    };
  }, []);

  return null;
}
