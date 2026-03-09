export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { auctions } from '@/db/schema';
import { desc, inArray } from 'drizzle-orm';
import { AuctionCard } from '@/components/auctions/AuctionCard';

export const metadata = {
  title: 'Auctions',
  description: 'Browse upcoming and current auctions at Mayell. Fine art, antiques, jewelry, watches, fashion, and collectibles — bid live on LiveAuctioneers.',
};

export default async function AuctionsPage() {
  const allAuctions = await db
    .select()
    .from(auctions)
    .where(inArray(auctions.status, ['scheduled', 'preview', 'open', 'live', 'closed']))
    .orderBy(desc(auctions.biddingStartsAt));

  const openAuctions = allAuctions.filter((a) => a.status === 'open' || a.status === 'live');
  const upcomingAuctions = allAuctions.filter((a) => a.status === 'scheduled' || a.status === 'preview');
  const pastAuctions = allAuctions.filter((a) => a.status === 'closed');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="font-display text-display-lg mb-8">Auctions</h1>

      {openAuctions.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display text-display-sm mb-6">Open for Bidding</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {openAuctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        </section>
      )}

      {upcomingAuctions.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display text-display-sm mb-6">Upcoming</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {upcomingAuctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        </section>
      )}

      {pastAuctions.length > 0 && (
        <section>
          <h2 className="font-display text-display-sm mb-6">Past Auctions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {pastAuctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        </section>
      )}

      {allAuctions.length === 0 && (
        <div className="text-center py-20">
          <p className="font-display text-display-sm text-muted-foreground">No auctions yet</p>
          <p className="text-muted-foreground mt-2">Check back soon for upcoming sales.</p>
        </div>
      )}
    </div>
  );
}
