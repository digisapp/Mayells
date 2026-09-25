'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

/**
 * Re-renders the page's server data every minute while the tab is in view,
 * and at once when the tab comes back. The current numbers stay on screen
 * until the new ones arrive, so nothing jumps. `renderedAt` comes from the
 * server render, so the stamp says when the numbers were read.
 */
export function AutoRefresh({ renderedAt, seconds = 60 }: { renderedAt: number; seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    function refresh() {
      if (document.visibilityState === 'visible') router.refresh();
    }
    const timer = setInterval(refresh, seconds * 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router, seconds]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0ca30c] opacity-50 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0ca30c]" />
      </span>
      Live · updated {time.format(renderedAt)}
    </span>
  );
}
