'use client';

import Link from 'next/link';
import { Phone } from 'lucide-react';
import { BUSINESS } from '@/lib/config';

export function AnnouncementBar() {
  return (
    <div className="bg-champagne text-charcoal">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 text-[12px] sm:text-[13px] font-semibold tracking-wide uppercase">
          <span>Free Appraisals</span>
          <span className="hidden sm:inline text-charcoal/40">|</span>
          <span className="hidden sm:inline">Estate Evaluations</span>
          <span className="hidden md:inline text-charcoal/40">|</span>
          <span className="hidden md:inline">We Buy &amp; Consign</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href={BUSINESS.phoneHref}
            className="flex items-center gap-1.5 text-[12px] sm:text-[13px] font-bold hover:text-charcoal/70 transition-colors"
          >
            <Phone className="h-3.5 w-3.5" />
            <span>{BUSINESS.phone}</span>
          </a>
          <Link
            href="/consign"
            className="hidden sm:inline-flex bg-charcoal text-white text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded hover:bg-charcoal/90 transition-colors"
          >
            Get Free Appraisal
          </Link>
        </div>
      </div>
    </div>
  );
}
