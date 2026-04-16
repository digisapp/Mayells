import { Skeleton } from '@/components/ui/skeleton';

export default function ConsignLoading() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-charcoal py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <Skeleton className="h-3 w-24 mx-auto bg-white/20" />
          <Skeleton className="h-12 w-80 mx-auto bg-white/20" />
          <Skeleton className="h-4 w-96 mx-auto bg-white/20" />
          <Skeleton className="h-4 w-72 mx-auto bg-white/20" />
          <div className="flex justify-center gap-3 pt-4">
            <Skeleton className="h-11 w-36 bg-white/20 rounded-md" />
            <Skeleton className="h-11 w-32 bg-white/20 rounded-md" />
          </div>
        </div>
      </section>

      {/* Form section */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-6">
        <Skeleton className="h-8 w-48 mx-auto" />
        <div className="space-y-4">
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      </section>
    </div>
  );
}
