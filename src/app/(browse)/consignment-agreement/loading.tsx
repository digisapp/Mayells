import { Skeleton } from '@/components/ui/skeleton';

export default function ConsignmentAgreementLoading() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-charcoal py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-4">
            <Skeleton className="h-3 w-16 bg-white/20" />
            <Skeleton className="h-16 w-72 bg-white/20" />
            <Skeleton className="h-16 w-48 bg-white/20" />
            <Skeleton className="h-4 w-96 bg-white/20" />
          </div>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
        <Skeleton className="h-12 w-48 rounded-md" />
      </div>
    </div>
  );
}
