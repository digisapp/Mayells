import { Skeleton } from '@/components/ui/skeleton';

export default function LotsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Skeleton className="h-10 w-48 mb-8" />
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-xl overflow-hidden border border-border/70">
            <Skeleton className="aspect-[3/4] w-full rounded-none" />
            <div className="p-3 sm:p-4 space-y-1.5">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
