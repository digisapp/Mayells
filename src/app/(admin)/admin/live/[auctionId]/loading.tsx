import { Skeleton } from '@/components/ui/skeleton';

// Console-shaped skeleton so the live list skeleton (../loading.tsx wraps
// every child route) doesn't flash before the console opens. The page reuses
// it while the auction and lots are fetched client-side.
export default function LiveConsoleLoading() {
  return (
    <div className="flex flex-col lg:flex-row gap-6" aria-busy="true" aria-label="Loading console">
      <div className="flex-1 min-w-0 space-y-4">
        <div>
          <Skeleton className="h-8 w-64 max-w-full mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-52 w-full rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
      <Skeleton className="h-[28rem] w-full lg:w-80 xl:w-96 rounded-lg" />
    </div>
  );
}
