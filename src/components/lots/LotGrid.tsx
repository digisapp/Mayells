import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LotCard, type LotCardLot } from './LotCard';

interface LotGridProps {
  lots: LotCardLot[];
  auctionSlug?: string;
  columns?: 2 | 3 | 4;
  isGallery?: boolean;
  /** False for lists that mix sales, where "Lot 1" would repeat meaninglessly. */
  showLotNumber?: boolean;
}

export function LotGrid({ lots, auctionSlug, columns = 4, isGallery, showLotNumber = true }: LotGridProps) {
  // 2-up on phones — the card typography already has compact mobile sizes, and
  // one full-screen card per lot makes browsing 48 lots a 48-scroll slog.
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  if (lots.length === 0) {
    return (
      <div className="text-center py-16 sm:py-20 border border-border/60 rounded-2xl px-6">
        <p className="font-display text-display-sm">No lots found</p>
        <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
          New pieces are catalogued regularly. See what is on offer in our current sales.
        </p>
        <Button asChild variant="outline" size="lg" className="mt-6">
          <Link href="/auctions">View auctions</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={`grid ${gridCols[columns]} gap-3 sm:gap-6`}>
      {lots.map((lot, index) => (
        // The first row is above the fold on every breakpoint (2 to 4 up).
        <LotCard
          key={lot.id}
          lot={lot}
          auctionSlug={auctionSlug}
          isGallery={isGallery}
          showLotNumber={showLotNumber}
          eager={index < 4}
        />
      ))}
    </div>
  );
}
