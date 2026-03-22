import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from './fmt';

interface RecentBid {
  amount: number;
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
            <div key={`${bid.created_at}-${bid.amount}-${bid.bidder_name}`} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium truncate max-w-[200px]">{bid.lot_title}</p>
                <p className="text-xs text-muted-foreground">{bid.bidder_name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{fmt(Number(bid.amount))}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(bid.created_at).toLocaleDateString()}
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
