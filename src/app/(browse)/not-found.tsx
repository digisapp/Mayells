import Link from 'next/link';
import { Button } from '@/components/ui/button';

// Mirrors error.tsx: same height, eyebrow, heading scale and button pair.
export default function BrowseNotFound() {
  return (
    <div className="min-h-[60svh] flex items-center justify-center px-4 py-12">
      <div className="text-center max-w-md">
        <p className="text-eyebrow text-champagne-deep mb-4">Error 404</p>
        <h1 className="font-display text-display-md mb-4">Page not found</h1>
        <p className="text-muted-foreground mb-8">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="champagne" size="lg">
            <Link href="/auctions">View Auctions</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">Go Home</Link>
          </Button>
        </div>
        {/* A third way out, quieter than the button pair. */}
        <p className="mt-6 text-sm text-muted-foreground">
          Or{' '}
          <Link
            href="/gallery"
            className="inline-flex min-h-11 items-center font-medium text-champagne-deep underline-offset-4 hover:underline"
          >
            browse the gallery
          </Link>
        </p>
      </div>
    </div>
  );
}
