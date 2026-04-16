import { Skeleton } from '@/components/ui/skeleton';

export default function AuctionsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-8 w-36 mb-2" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <div className="p-4 border-b">
          <div className="grid grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="p-4 border-b last:border-0">
            <div className="grid grid-cols-6 gap-4 items-center">
              <div>
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-16 rounded-md" />
                <Skeleton className="h-8 w-20 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
