// ISR: cacheable at the CDN; bid activity and admin lot mutations revalidate
// on demand.
export const revalidate = 60;

import { db } from '@/db';
import { lots } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { bestAuctionSlugSql } from '@/lib/lots/auction-slug';
import { LotGrid } from '@/components/lots/LotGrid';

export const metadata = {
  title: 'Browse Lots',
  description: 'Browse auction lots at Mayells. Paintings, sculptures, antique furniture, jewelry, watches, designer fashion, and collectibles with expert cataloging.',
  openGraph: {
    title: 'Browse Lots | Mayells',
    description: 'Browse auction lots — paintings, sculptures, antique furniture, jewelry, watches, and collectibles.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Browse Lots | Mayells',
    description: 'Browse auction lots — paintings, sculptures, antique furniture, jewelry, watches, and collectibles.',
  },
};

export default async function LotsPage() {
  const rows = await db
    .select({ lot: lots, auctionSlug: bestAuctionSlugSql })
    .from(lots)
    .where(eq(lots.status, 'in_auction'))
    .orderBy(desc(lots.createdAt))
    .limit(48);

  // Carry each lot's auction slug so cards link straight to the canonical
  // /auctions/{slug}/lots/{lot} URL instead of the /lots/{slug} redirect hop.
  const allLots = rows.map(({ lot, auctionSlug }) => ({ ...lot, auctionSlug }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="font-display text-display-lg mb-8">Browse Lots</h1>
      <LotGrid lots={allLots} />
    </div>
  );
}
