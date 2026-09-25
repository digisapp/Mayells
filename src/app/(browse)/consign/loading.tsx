import { Skeleton } from '@/components/ui/skeleton';

export default function ConsignLoading() {
  return (
    <div>
      {/* Hero: heading, then the form card (its own column from lg) */}
      <section className="bg-charcoal">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 pt-10 pb-12 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,31rem)] lg:items-center lg:gap-x-16 lg:px-8 lg:py-20 xl:gap-x-24">
          <div className="space-y-4">
            <Skeleton className="h-3 w-44 bg-white/15" />
            <Skeleton className="h-12 w-72 bg-white/15 sm:h-14 sm:w-96" />
            <Skeleton className="h-4 w-full max-w-md bg-white/15" />
            <Skeleton className="h-4 w-4/5 max-w-sm bg-white/15" />
          </div>
          <div className="space-y-4 rounded-2xl bg-card p-5 sm:p-8">
            <Skeleton className="h-7 w-60" />
            <Skeleton className="h-4 w-full" />
            <div className="grid gap-4 pt-2 sm:grid-cols-2">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        </div>
      </section>
    </div>
  );
}
