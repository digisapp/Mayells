import type { ReactNode } from 'react';
import { Phone } from 'lucide-react';
import { BUSINESS } from '@/lib/config';

/**
 * Header for the private upload flow: the MAYELLS wordmark and, unless the
 * screen supplies its own action, a way to reach a person.
 */
export function UploadHeader({ children, left }: { children?: ReactNode; left?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-charcoal/10 bg-ivory/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-xl items-center justify-between gap-3 px-5">
        {left ?? <span className="font-logo text-[19px] tracking-[0.15em]">MAYELLS</span>}
        {children ?? (
          <a
            href={BUSINESS.phoneHref}
            className="-mr-2 inline-flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-charcoal/70 hover:text-charcoal"
          >
            <Phone className="h-4 w-4" />
            <span className="tabular-nums">{BUSINESS.phone}</span>
          </a>
        )}
      </div>
    </header>
  );
}
