'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function BrowseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // Mirrors not-found.tsx: same height, eyebrow, heading scale and button pair.
  return (
    <div className="min-h-[60svh] flex items-center justify-center px-4 py-12">
      <div className="text-center max-w-md">
        <p className="text-eyebrow text-champagne-deep mb-4">Unexpected error</p>
        <h1 className="font-display text-display-md mb-4">Something went wrong</h1>
        <p className="text-muted-foreground mb-8">
          We hit an unexpected error loading this page. Try again, or head back home.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground mb-6 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} variant="champagne" size="lg">
            Try Again
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
