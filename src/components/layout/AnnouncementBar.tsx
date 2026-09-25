'use client';

import Link from 'next/link';
import { Phone } from 'lucide-react';
import { BUSINESS } from '@/lib/config';

export function AnnouncementBar() {
  return (
    <div className="bg-champagne text-charcoal">
      {/* 40px tall on phones (was 34) so the phone link can fill it: the
          header below is sticky and paints over anything that overflows. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-10 sm:min-h-0 sm:py-2 flex items-center justify-between gap-4">
        {/* The third phrase waits for lg: at tablet widths (and a landscape
            iPhone inside its notch insets) all three wrapped to two lines. */}
        <div className="flex items-center gap-6 whitespace-nowrap text-[12px] sm:text-[13px] font-semibold tracking-wide uppercase">
          <span>Free Appraisals</span>
          <span className="hidden sm:inline text-charcoal/40">|</span>
          <span className="hidden sm:inline">Estate Evaluations</span>
          <span className="hidden lg:inline text-charcoal/40">|</span>
          <span className="hidden lg:inline">We Buy &amp; Consign</span>
        </div>
        <div className="flex items-center gap-4 self-stretch sm:self-auto">
          <a
            href={BUSINESS.phoneHref}
            className="flex items-center gap-1.5 whitespace-nowrap self-stretch -mx-2 px-2 sm:self-auto sm:mx-0 sm:px-0 sm:py-3 sm:-my-3 text-[12px] sm:text-[13px] font-bold hover:text-charcoal/70 transition-colors"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            <span>{BUSINESS.phone}</span>
          </a>
          <Link
            href="/consign"
            className="hidden sm:inline-flex whitespace-nowrap bg-charcoal text-white text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded hover:bg-charcoal/90 transition-colors"
          >
            Get Free Appraisal
          </Link>
        </div>
      </div>
    </div>
  );
}
