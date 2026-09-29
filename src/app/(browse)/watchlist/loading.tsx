import { Heart } from 'lucide-react';
import { AccountShell } from '@/components/account/AccountShell';
import { Skeleton } from '@/components/ui/skeleton';

export default function WatchlistLoading() {
  return (
    <AccountShell active="watchlist" title="My Watchlist" icon={<Heart className="h-6 w-6 text-champagne fill-current" />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border/50">
            <Skeleton className="aspect-[4/3] rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-6 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </AccountShell>
  );
}
