import { Skeleton } from '@/components/ui/skeleton';

export default function AuctionsLoading() {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <Skeleton className="h-8 w-36 mb-2" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-md" />
        ))}
      </div>
      {/* Format filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-md" />
        ))}
      </div>

      {/* Table: Sale · Format · Status · Lots · Bids · Premium · Opens · Closes · actions */}
      <div className="rounded-lg border overflow-x-auto">
        <div className="p-4 border-b min-w-[900px]">
          <div className="grid grid-cols-9 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="p-4 border-b last:border-0 min-w-[900px]">
            <div className="grid grid-cols-9 gap-4 items-center">
              <div>
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-8 ml-auto" />
              <Skeleton className="h-4 w-8 ml-auto" />
              <Skeleton className="h-4 w-10 ml-auto" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-28" />
              <div className="flex gap-1 justify-end">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
