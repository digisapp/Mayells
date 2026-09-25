import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function BrowseNotFound() {
  return (
    <div className="min-h-[60dvh] flex items-center justify-center px-4 py-12">
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
  );
}
