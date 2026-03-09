export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { lots } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { LotGrid } from '@/components/lots/LotGrid';

export const metadata = {
  title: 'Browse Lots',
  description: 'Browse auction lots at Mayell. Paintings, sculptures, antique furniture, jewelry, watches, designer fashion, and collectibles with expert cataloging.',
};

export default async function LotsPage() {
  const allLots = await db
    .select()
    .from(lots)
    .where(eq(lots.status, 'in_auction'))
    .orderBy(desc(lots.createdAt))
    .limit(48);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="font-display text-display-lg mb-8">Browse Lots</h1>
      <LotGrid lots={allLots} />
    </div>
  );
}
