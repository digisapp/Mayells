import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-5 space-y-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-44" />
          </div>
        ))}
      </div>
    </div>
  );
}
