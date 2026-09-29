// ISR: cacheable at the CDN; admin auction mutations revalidate on demand.
export const revalidate = 60;

import { db } from '@/db';
import { auctions } from '@/db/schema';
import { desc, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { AuctionCard } from '@/components/auctions/AuctionCard';
import { auctionWithVisibleLotCount } from '@/components/auctions/visible-lot-count';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Auctions',
  description: 'Browse upcoming and current auctions at Mayells. Fine art, antiques, jewelry, watches, fashion, and collectibles.',
  openGraph: {
    title: 'Auctions | Mayells',
    description: 'Browse upcoming, live, and past auctions for fine art, antiques, jewelry, and collectibles.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Auctions | Mayells',
    description: 'Browse upcoming, live, and past auctions for fine art, antiques, jewelry, and collectibles.',
  },
};

export default async function AuctionsPage() {
  const allAuctions = await db
    .select(auctionWithVisibleLotCount)
    .from(auctions)
    // Include 'completed' — settlement flips every finished auction to
    // 'completed', so omitting it made the entire past-sale archive vanish
    // within one cron tick of an auction ending.
    .where(inArray(auctions.status, ['scheduled', 'preview', 'open', 'live', 'closing', 'closed', 'completed']))
    .orderBy(desc(auctions.biddingStartsAt))
    // Bound the archive: open/upcoming sales are always few, so the cap only
    // trims the oldest past sales once the archive grows beyond ~100 entries.
    .limit(100);

  // 'closing' is still taking bids (staggered lot closes), so it belongs with
  // the open sales, as on the home page.
  const openAuctions = allAuctions.filter((a) => a.status === 'open' || a.status === 'live' || a.status === 'closing');
  const upcomingAuctions = allAuctions.filter((a) => a.status === 'scheduled' || a.status === 'preview');
  const pastAuctions = allAuctions.filter((a) => a.status === 'closed' || a.status === 'completed');
  // The first row of whichever section renders first is above the fold.
  const firstSection = openAuctions.length > 0 ? openAuctions : upcomingAuctions.length > 0 ? upcomingAuctions : pastAuctions;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:py-12">
      <h1 className="font-display text-display-lg mb-6 sm:mb-8">Auctions</h1>

      {openAuctions.length > 0 && (
        <section className="mb-10 sm:mb-12">
          <h2 className="font-display text-display-sm mb-4 sm:mb-6">Open for Bidding</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {openAuctions.map((auction, index) => (
              <AuctionCard key={auction.id} auction={auction} eager={openAuctions === firstSection && index < 3} />
            ))}
          </div>
        </section>
      )}

      {upcomingAuctions.length > 0 && (
        <section className="mb-10 sm:mb-12">
          <h2 className="font-display text-display-sm mb-4 sm:mb-6">Upcoming</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {upcomingAuctions.map((auction, index) => (
              <AuctionCard key={auction.id} auction={auction} eager={upcomingAuctions === firstSection && index < 3} />
            ))}
          </div>
        </section>
      )}

      {pastAuctions.length > 0 && (
        <section>
          <h2 className="font-display text-display-sm mb-4 sm:mb-6">Past Auctions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {pastAuctions.map((auction, index) => (
              <AuctionCard key={auction.id} auction={auction} eager={pastAuctions === firstSection && index < 3} />
            ))}
          </div>
        </section>
      )}

      {allAuctions.length === 0 && (
        <div className="text-center py-16 sm:py-20 border border-border/60 rounded-2xl px-6">
          <p className="font-display text-display-sm">No auctions scheduled yet</p>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
            New sales are catalogued regularly. In the meantime, browse fixed-price pieces in the gallery.
          </p>
          <Button asChild variant="outline" size="lg" className="mt-6">
            <Link href="/gallery">Shop the gallery</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
