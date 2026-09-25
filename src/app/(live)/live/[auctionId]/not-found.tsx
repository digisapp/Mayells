import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Reached for an unknown sale and, more usefully, when a sale ends while
 * someone is watching: the viewer's soft refresh re-runs the page, which only
 * renders for live sales.
 */
export default function LiveAuctionNotFound() {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center justify-center px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]"
    >
      <div className="max-w-md text-center">
        <p className="font-logo text-lg text-champagne">MAYELLS</p>
        <h1 className="mt-8 font-display text-display-sm text-foreground">This sale isn&apos;t live right now</h1>
        <p className="mt-3 text-muted-foreground">
          It may have ended, or not started yet. Results and upcoming sales are on the auctions page.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="h-11 px-6">
            <Link href="/auctions">View auctions</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 px-6">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
