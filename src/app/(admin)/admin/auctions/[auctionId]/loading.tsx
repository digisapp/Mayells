import { Skeleton } from '@/components/ui/skeleton';

// Detail-shaped skeleton so the auctions list skeleton (../loading.tsx wraps
// every child route) doesn't flash before a sale opens. The page reuses it
// while the auction is fetched client-side. Settlement keeps its own.
export default function AuctionDetailLoading() {
  return (
    <div className="max-w-5xl" aria-busy="true" aria-label="Loading auction">
      <Skeleton className="h-8 w-72 max-w-full mb-2" />
      <Skeleton className="h-4 w-96 max-w-full mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-xl mb-6" />
      <Skeleton className="h-9 w-48 rounded-lg mb-6" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
