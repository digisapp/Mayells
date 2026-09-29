'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Phone } from 'lucide-react';
import { CallLink } from './CallLink';

interface Props {
  site: string;
  phone: string;
  phoneHref: string;
}

/**
 * Persistent mobile conversion bar.
 *
 * Without it the only calls to action on a ~4,800px page are in the hero, so
 * every visitor who starts reading has to scroll back up to act. It stays out
 * of the way in two situations: before the hero has scrolled away (the hero's
 * own buttons are still on screen), and whenever a lead form is actually
 * visible, where a floating duplicate would just cover the fields.
 *
 * While shown it publishes its height as --mobile-cta-bar (the site-wide
 * contract, see globals.css), so the chat bubble rides above it and the footer
 * pads itself clear of it; hidden, the var is removed and both drop back.
 */
export function StickyCallBar({ site, phone, phoneHref }: Props) {
  const [past, setPast] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > 520);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const forms = document.querySelectorAll('[data-lead-form]');
    if (!forms.length) return;
    const seen = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) seen.add(e.target);
          else seen.delete(e.target);
        }
        setFormVisible(seen.size > 0);
      },
      { rootMargin: '-10% 0px -10% 0px' },
    );
    forms.forEach((f) => io.observe(f));
    return () => io.disconnect();
  }, []);

  const show = past && !formVisible;

  useEffect(() => {
    const bar = barRef.current;
    if (!show || !bar) return;
    const root = document.documentElement;
    // The bar is lg:hidden; globals.css also pins the var to 0 from 1024px.
    const belowLg = window.matchMedia('(max-width: 1023.98px)');
    const sync = () => {
      if (belowLg.matches) root.style.setProperty('--mobile-cta-bar', `${Math.round(bar.offsetHeight)}px`);
      else root.style.removeProperty('--mobile-cta-bar');
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(bar);
    belowLg.addEventListener('change', sync);
    return () => {
      ro.disconnect();
      belowLg.removeEventListener('change', sync);
      root.style.removeProperty('--mobile-cta-bar');
    };
  }, [show]);

  return (
    <div
      ref={barRef}
      aria-hidden={!show}
      inert={!show}
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur transition-transform duration-200 lg:hidden ${
        show ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex gap-2.5 px-4 py-3">
        <CallLink
          href={phoneHref}
          site={site}
          placement="sticky"
          tabIndex={show ? 0 : -1}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background text-[15px] font-semibold"
        >
          <Phone className="h-4 w-4" />
          Call
        </CallLink>
        <a
          href="#appraisal"
          tabIndex={show ? 0 : -1}
          className="inline-flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-lg bg-champagne text-[15px] font-semibold text-charcoal"
        >
          Free appraisal
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
      <span className="sr-only">{phone}</span>
    </div>
  );
}
