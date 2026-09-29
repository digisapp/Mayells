import { Skeleton } from '@/components/ui/skeleton';

// Detail-shaped skeleton so the lots list skeleton (../loading.tsx wraps every
// child route) doesn't flash before a lot opens. The page reuses it while the
// lot is fetched client-side.
export default function LotDetailLoading() {
  return (
    <div className="max-w-3xl" aria-busy="true" aria-label="Loading lot">
      <Skeleton className="h-8 w-72 max-w-full mb-2" />
      <Skeleton className="h-5 w-24 rounded-full mb-6" />
      <Skeleton className="h-48 w-full rounded-xl mb-6" />
      <Skeleton className="h-28 w-full rounded-xl mb-6" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
