import { Skeleton } from '@/components/ui/skeleton';

export default function ProspectsLoading() {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <Skeleton className="h-8 w-36 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border py-4 px-5 flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <div>
              <Skeleton className="h-7 w-10 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <Skeleton className="h-9 w-full rounded-md mb-4" />

      {/* Status chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Array.from({ length: 11 }).map((_, i) => (
          <Skeleton key={i} className="h-[30px] w-24 rounded-md" />
        ))}
      </div>

      {/* Table: Name · Contact · Source · Status · Items · Est. value · Created · actions */}
      <div className="rounded-lg border overflow-x-auto">
        <div className="p-4 border-b min-w-[800px]">
          <div className="grid grid-cols-8 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="p-4 border-b last:border-0 min-w-[800px]">
            <div className="grid grid-cols-8 gap-4 items-center">
              <div>
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-8 ml-auto" />
              <Skeleton className="h-4 w-24 ml-auto" />
              <Skeleton className="h-3 w-20" />
              <div className="flex gap-1 justify-end">
                <Skeleton className="h-8 w-8 rounded-md" />
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
