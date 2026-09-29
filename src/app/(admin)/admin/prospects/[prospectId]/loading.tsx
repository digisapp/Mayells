import { Skeleton } from '@/components/ui/skeleton';

// Detail-shaped skeleton: without it the list skeleton in ../loading.tsx
// (which wraps every child route) flashes before a prospect opens. The page
// reuses it for its Suspense fallback and client-side loading state.
export default function ProspectDetailLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading prospect">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
