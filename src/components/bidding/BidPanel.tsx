'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Gavel, Clock, AlertTriangle } from 'lucide-react';
import { useBidding } from '@/hooks/useBidding';
import { AuctionCountdown } from '@/components/auctions/AuctionCountdown';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/types';
import { getNextMinBid, getQuickBidOptions, getMinIncrement } from '@/lib/bidding/bid-increments';
import Link from 'next/link';

interface BidPanelProps {
  lotId: string;
  auctionId: string;
  currentBid: number;
  bidCount: number;
  closingAt: Date | null;
  estimateLow?: number | null;
  estimateHigh?: number | null;
  startingBid?: number | null;
}

export function BidPanel({
  lotId,
  auctionId,
  currentBid: initialBid,
  bidCount: initialCount,
  closingAt: initialClosing,
  estimateLow,
  estimateHigh,
  startingBid,
}: BidPanelProps) {
  const { isAuthenticated } = useAuth();
  const {
    currentBid,
    bidCount,
    closingAt,
    isExtended,
    isSubmitting,
    error,
    placeBid,
    clearError,
  } = useBidding(auctionId, lotId, {
    currentBid: initialBid,
    bidCount: initialCount,
    closingAt: initialClosing ? Math.floor(initialClosing.getTime() / 1000) : null,
    isExtended: false,
  });

  const [customAmount, setCustomAmount] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bidToConfirm, setBidToConfirm] = useState<number>(0);

  const nextMinBid = getNextMinBid(currentBid || startingBid || 0);
  const quickOptions = getQuickBidOptions(currentBid || startingBid || 0);
  const minIncrement = getMinIncrement(currentBid || startingBid || 0);

  function handleBidClick(amount: number) {
    setBidToConfirm(amount);
    setConfirmOpen(true);
  }

  async function handleConfirmBid() {
    const success = await placeBid(bidToConfirm);
    if (success) {
      setConfirmOpen(false);
      setCustomAmount('');
    }
  }

  function handleCustomBid() {
    const amount = Math.round(parseFloat(customAmount) * 100);
    if (isNaN(amount) || amount < nextMinBid) return;
    handleBidClick(amount);
  }

  return (
    <div className="bg-card border border-border/50 rounded-lg p-6 space-y-4 sticky top-20">
      {/* Current bid */}
      <div>
        <p className="text-sm text-muted-foreground">
          {currentBid > 0 ? 'Current Bid' : 'Starting Bid'}
        </p>
        <p className="font-display text-display-md">
          {formatCurrency(currentBid > 0 ? currentBid : startingBid || 0)}
        </p>
        <p className="text-sm text-muted-foreground">
          {bidCount} bid{bidCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Estimate */}
      {estimateLow && estimateHigh && (
        <p className="text-sm text-muted-foreground">
          Estimate: {formatCurrency(estimateLow)} — {formatCurrency(estimateHigh)}
        </p>
      )}

      <Separator />

      {/* Countdown */}
      {closingAt && (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Closes in:</span>
          <AuctionCountdown
            endsAt={new Date(closingAt * 1000)}
            className="text-sm font-medium"
          />
          {isExtended && (
            <Badge variant="destructive" className="text-xs">Extended!</Badge>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {isAuthenticated ? (
        <>
          {/* Quick bid buttons */}
          <div className="space-y-2">
            <Label className="text-sm">Quick Bid</Label>
            <div className="grid grid-cols-3 gap-2">
              {quickOptions.map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => handleBidClick(amount)}
                  disabled={isSubmitting}
                >
                  {formatCurrency(amount)}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom bid */}
          <div className="space-y-2">
            <Label className="text-sm">Custom Bid</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  placeholder={`Min ${formatCurrency(nextMinBid).replace('$', '')}`}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
              <Button onClick={handleCustomBid} disabled={isSubmitting}>
                <Gavel className="h-4 w-4 mr-2" />
                Bid
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum increment: {formatCurrency(minIncrement)}
            </p>
          </div>
        </>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-3">Sign in to place a bid</p>
          <Link href={`/login?next=/lots/${lotId}`}>
            <Button className="w-full">Sign In to Bid</Button>
          </Link>
        </div>
      )}

      {/* Bid confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Confirm Your Bid</DialogTitle>
            <DialogDescription>
              Please review your bid before submitting.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-2xl font-display text-center">{formatCurrency(bidToConfirm)}</p>
            <p className="text-sm text-muted-foreground text-center mt-2">
              By placing this bid, you agree to purchase this lot at this price plus buyer&apos;s premium if you are the winning bidder.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmBid} disabled={isSubmitting}>
              {isSubmitting ? 'Placing bid...' : 'Confirm Bid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
