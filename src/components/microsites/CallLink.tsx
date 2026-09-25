'use client';

import type { ReactNode } from 'react';
import { track } from '@vercel/analytics';

interface Props {
  href: string;
  /** Microsite slug — attributes the call to this city, like `microsite_lead`. */
  site: string;
  /** Where on the page the number was tapped. */
  placement: 'header' | 'hero' | 'section' | 'faq' | 'footer' | 'sticky';
  className?: string;
  tabIndex?: number;
  children: ReactNode;
}

/**
 * A tel: link that records the tap.
 *
 * Half of this audience will phone rather than type, so without this the
 * per-domain test only counts the form and undercounts every site by the
 * callers. SiteTracker records every tel: tap for the admin; this adds where
 * on the page it was. The event is fire-and-forget: the dialer opens
 * regardless.
 */
export function CallLink({ href, site, placement, className, tabIndex, children }: Props) {
  return (
    <a
      href={href}
      className={className}
      tabIndex={tabIndex}
      data-call-placement={placement}
      onClick={() => track('microsite_call', { site, placement })}
    >
      {children}
    </a>
  );
}
