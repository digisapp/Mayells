import { Skeleton } from '@/components/ui/skeleton';

export default function LotsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <div className="p-4 border-b">
          <div className="grid grid-cols-7 gap-4">
            {['Image', 'Title', 'Category', 'Status', 'Estimate', 'Bids', ''].map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="p-4 border-b last:border-0">
            <div className="grid grid-cols-7 gap-4 items-center">
              <Skeleton className="h-12 w-12 rounded" />
              <div>
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <Skeleton className="h-4 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>
    </div>
  );
}
