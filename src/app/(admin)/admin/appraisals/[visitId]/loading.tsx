import { Skeleton } from '@/components/ui/skeleton';

// Detail-shaped skeleton so the appraisals list skeleton (../loading.tsx wraps
// every child route) doesn't flash before a visit opens. The page reuses it
// while the visit is fetched client-side.
export default function AppraisalDetailLoading() {
  return (
    <div aria-busy="true" aria-label="Loading appraisal">
      <Skeleton className="h-8 w-64 max-w-full mb-2" />
      <Skeleton className="h-4 w-80 max-w-full mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-14 w-full rounded-xl mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  );
}
