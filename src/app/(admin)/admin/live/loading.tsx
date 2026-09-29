import { Skeleton } from '@/components/ui/skeleton';

export default function LiveLoading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-8 w-44 mb-2" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      {/* One card per live-format sale */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 py-4">
            <div className="min-w-0">
              <Skeleton className="h-5 w-64 mb-2" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
