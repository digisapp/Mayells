'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const INTERVAL_MS = 5000;
const MAX_TRIES = 12; // ~1 minute

/**
 * Shown after Stripe redirects back (?paid=1) but before the webhook has
 * marked the invoice paid. Re-renders the server page every few seconds so
 * the paid state appears on its own, then stops and leaves a manual refresh.
 */
export function PaymentProcessingRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const [tries, setTries] = useState(0);
  const done = tries >= MAX_TRIES;

  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, INTERVAL_MS);
    return () => clearTimeout(t);
  }, [tries, done, router]);

  return (
    <div role="status" className="flex items-start gap-3 text-sm">
      {!done && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
      <p>
        {done ? (
          <>
            Your payment is still being confirmed, which can take a few minutes. If you completed checkout, you
            don&rsquo;t need to pay again. If you left before paying,{' '}
            {/* The plain invoice URL (no ?paid) shows the pay button again. */}
            <Link href={pathname} className="font-medium underline underline-offset-4 hover:text-champagne-deep">
              return to the invoice
            </Link>
            .
          </>
        ) : (
          'Thanks — we’re confirming your payment… This page will update in a moment.'
        )}{' '}
        <button
          type="button"
          onClick={() => {
            router.refresh();
            setTries(0);
          }}
          className="font-medium underline underline-offset-4 hover:text-champagne-deep"
        >
          Refresh now
        </button>
      </p>
    </div>
  );
}
