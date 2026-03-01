'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="font-display text-display-md mb-4">Something went wrong</h1>
        <p className="text-muted-foreground mb-8">
          An unexpected error occurred. Please try again.
        </p>
        <Button
          onClick={reset}
          className="bg-champagne text-charcoal hover:bg-champagne/90"
        >
          Try Again
        </Button>
      </div>
    </div>
  );
}
