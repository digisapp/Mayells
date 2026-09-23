'use client';

import type { ReactNode } from 'react';
import { track } from '@vercel/analytics';
import { sendMicrositeEvent } from '@/lib/microsites/beacon';

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
 * callers. The event is fire-and-forget: the dialer opens regardless.
 */
export function CallLink({ href, site, placement, className, tabIndex, children }: Props) {
  return (
    <a
      href={href}
      className={className}
      tabIndex={tabIndex}
      onClick={() => {
        track('microsite_call', { site, placement });
        sendMicrositeEvent(site, 'call', placement);
      }}
    >
      {children}
    </a>
  );
}
