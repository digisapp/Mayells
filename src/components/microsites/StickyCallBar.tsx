'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Phone } from 'lucide-react';

interface Props {
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
 */
export function StickyCallBar({ phone, phoneHref }: Props) {
  const [past, setPast] = useState(false);
  const [formVisible, setFormVisible] = useState(false);

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

  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur transition-transform duration-200 lg:hidden ${
        show ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex gap-2.5 px-4 py-3">
        <a
          href={phoneHref}
          tabIndex={show ? 0 : -1}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background text-[15px] font-semibold"
        >
          <Phone className="h-4 w-4" />
          Call
        </a>
        <a
          href="#appraisal"
          tabIndex={show ? 0 : -1}
          className="inline-flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground"
        >
          Free appraisal
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
      <span className="sr-only">{phone}</span>
    </div>
  );
}
