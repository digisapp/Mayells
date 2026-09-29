import { Skeleton } from '@/components/ui/skeleton';

export default function CategoryLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:py-12">
      {/* Header — mirrors the page's h1, description and count line */}
      <div className="mb-6 sm:mb-10">
        <Skeleton className="h-10 w-48 mb-3" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-4 w-16 mb-5 sm:mb-6" />

      {/* Lot grid — same columns and card shape as LotGrid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-xl overflow-hidden border border-border/70">
            <Skeleton className="aspect-[3/4] w-full rounded-none" />
            <div className="p-3 sm:p-4 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
