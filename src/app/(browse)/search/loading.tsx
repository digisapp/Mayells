import { Skeleton } from '@/components/ui/skeleton';

export default function SearchLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Search bar */}
      <div className="mb-8">
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-3 mb-8">
        <Skeleton className="h-9 w-32 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-36 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>

      {/* Results count */}
      <Skeleton className="h-4 w-32 mb-6" />

      {/* Lot grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
