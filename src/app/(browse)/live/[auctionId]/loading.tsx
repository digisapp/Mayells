import { Skeleton } from '@/components/ui/skeleton';

export default function LiveAuctionLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Auction header */}
      <div className="mb-8">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-5 w-40" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main lot view */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
          {/* Bid panel */}
          <div className="border rounded-xl p-6 flex flex-col gap-4">
            <div className="flex justify-between">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-8 w-28" />
            </div>
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>

        {/* Lot list sidebar */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-32 mb-2" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-center">
              <Skeleton className="h-16 w-16 rounded-md flex-shrink-0" />
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
