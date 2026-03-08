'use client';

import { DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function PayoutsPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-display-sm mb-8">Payouts</h1>

      <Card>
        <CardContent className="py-12 text-center">
          <DollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-1">No payouts yet</p>
          <p className="text-sm text-muted-foreground">
            When your consigned items sell, payouts will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
