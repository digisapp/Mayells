import { Skeleton } from '@/components/ui/skeleton';

export default function AuctionDetailLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 sm:pt-8">
      {/* Back link */}
      <div className="flex h-6 items-center">
        <Skeleton className="h-3.5 w-24" />
      </div>

      {/* Header */}
      <div className="mt-6 sm:mt-8 mb-8 sm:mb-10 space-y-3">
        <div className="flex gap-3">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="flex flex-wrap gap-x-6 gap-y-3 pt-3">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>

      {/* Lot grid */}
      <Skeleton className="h-7 w-20 mb-4 sm:mb-6" />
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
