import { Skeleton } from '@/components/ui/skeleton';

const COLUMNS = ['', 'Title', 'Auction', 'Seller', 'Department', 'Type', 'Status', 'Price / Estimate', 'Bids', ''];

export default function LotsLoading() {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-20 rounded-full" />
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-40 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <div className="min-w-[960px]">
          <div className="p-4 border-b">
            <div className="grid grid-cols-10 gap-4">
              {COLUMNS.map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="p-4 border-b last:border-0">
              <div className="grid grid-cols-10 gap-4 items-center">
                <Skeleton className="h-10 w-10 rounded" />
                <div>
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <div>
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <Skeleton className="h-4 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
        </div>
      </div>
    </div>
  );
}
