import Link from 'next/link';
import { Button } from '@/components/ui/button';

// Rendered outside the (browse) layout, so it carries its own wordmark to
// keep the page recognisably Mayells.
export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <Link href="/" className="font-logo text-2xl tracking-[0.15em] inline-flex items-center min-h-11">
        MAYELLS
      </Link>
      <div className="flex-1 flex items-center">
        <div className="text-center max-w-md">
          <p className="font-display text-display-xl text-champagne-deep mb-4">404</p>
          <h1 className="font-display text-display-sm mb-4">Page Not Found</h1>
          <p className="text-muted-foreground mb-8">
            The page you&apos;re looking for doesn&apos;t exist or may have been moved.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="champagne" size="lg">
              <Link href="/">Go Home</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/auctions">View Auctions</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/gallery">Browse Gallery</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
