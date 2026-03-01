import { LotCard } from './LotCard';
import type { Lot } from '@/db/schema/lots';

interface LotGridProps {
  lots: Lot[];
  auctionSlug?: string;
  columns?: 2 | 3 | 4;
}

export function LotGrid({ lots, auctionSlug, columns = 4 }: LotGridProps) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  if (lots.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">No lots found</p>
      </div>
    );
  }

  return (
    <div className={`grid ${gridCols[columns]} gap-6`}>
      {lots.map((lot) => (
        <LotCard key={lot.id} lot={lot} auctionSlug={auctionSlug} />
      ))}
    </div>
  );
}
