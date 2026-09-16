import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from './fmt';

export interface RecentBid {
  id: string;
  lot_id: string;
  amount: number;
  status: string;
  created_at: string;
  lot_title: string;
  bidder_name: string;
}

export function RecentBidsCard({ bids }: { bids: RecentBid[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Recent Bids</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {bids.map((bid) => (
            <div key={bid.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/admin/lots/${bid.lot_id}`} className="text-sm font-medium truncate block hover:underline">
                  {bid.lot_title}
                </Link>
                <p className="text-xs text-muted-foreground truncate">{bid.bidder_name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium tabular-nums">{fmt(Number(bid.amount))}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(bid.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
          ))}
          {bids.length === 0 && (
            <p className="text-sm text-muted-foreground">No bids yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
