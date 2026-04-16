import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function BrowseNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="font-display text-display-xl text-champagne mb-4">404</p>
        <h1 className="font-display text-display-sm mb-4">Page Not Found</h1>
        <p className="text-muted-foreground mb-8">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
        <div className="flex gap-4 justify-center">
          <Button className="bg-champagne text-charcoal hover:bg-champagne/90" asChild>
            <Link href="/">Go Home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/gallery">Browse Gallery</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
