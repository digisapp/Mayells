'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatCurrency } from '@/types';
import { AuctionCountdown } from '@/components/auctions/AuctionCountdown';
import { BidForm } from '@/components/lots/BidForm';
import { getMinNextBid } from '@/lib/bidding/bid-increments';

interface LiveLotPanelProps {
  lotRef: string; // slug or id used for the state endpoint
  initialCurrentBidAmount: number;
  initialBidCount: number;
  startingBid: number;
  estimateLow: number | null;
  estimateHigh: number | null;
  closingAt: string | null; // ISO
  serverNow: number; // ms since epoch, captured server-side at render
  initialIsBiddable: boolean;
  initialIsHighBidder: boolean;
}

const POLL_MS = 6000;

/**
 * Live-updating price + countdown for a lot. Polls the lightweight lot-state
 * endpoint while the tab is visible and the lot is still biddable, so a bidder
 * watching the final minutes sees the current bid and time-to-close move in
 * near-real-time instead of a frozen server snapshot. The countdown is corrected
 * for device clock skew via the server clock (see AuctionCountdown).
 */
export function LiveLotPanel({
  lotRef,
  initialCurrentBidAmount,
  initialBidCount,
  startingBid,
  estimateLow,
  estimateHigh,
  closingAt: initialClosingAt,
  serverNow,
  initialIsBiddable,
  initialIsHighBidder,
}: LiveLotPanelProps) {
  const [currentBidAmount, setCurrentBidAmount] = useState(initialCurrentBidAmount);
  const [bidCount, setBidCount] = useState(initialBidCount);
  const [minNextBid, setMinNextBid] = useState(getMinNextBid(initialCurrentBidAmount, startingBid));
  const [isHighBidder, setIsHighBidder] = useState(initialIsHighBidder);
  const [closingAt, setClosingAt] = useState(initialClosingAt);
  const [isBiddable, setIsBiddable] = useState(initialIsBiddable);
  const [flash, setFlash] = useState(false);

  const prevBid = useRef(initialCurrentBidAmount);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/lots/${encodeURIComponent(lotRef)}/state`, { cache: 'no-store' });
      if (!res.ok) return;
      const { data } = await res.json();
      if (!data) return;
      if (typeof data.currentBidAmount === 'number' && data.currentBidAmount !== prevBid.current) {
        prevBid.current = data.currentBidAmount;
        setCurrentBidAmount(data.currentBidAmount);
        setFlash(true);
        setTimeout(() => setFlash(false), 1200);
      }
      if (typeof data.bidCount === 'number') setBidCount(data.bidCount);
      if (typeof data.minNextBid === 'number') setMinNextBid(data.minNextBid);
      if (typeof data.isHighBidder === 'boolean') setIsHighBidder(data.isHighBidder);
      if (data.closingAt !== undefined) setClosingAt(data.closingAt);
      if (typeof data.isBiddable === 'boolean') setIsBiddable(data.isBiddable);
    } catch {
      // transient network error — keep the last known values
    }
  }, [lotRef]);

  // After the user places a bid, reflect it immediately, then poll to reconcile
  // (e.g. a proxy war may have pushed the price higher server-side).
  const handleBidPlaced = useCallback(
    (next: { currentBidAmount: number; bidCount: number; isHighBidder: boolean }) => {
      prevBid.current = next.currentBidAmount;
      setCurrentBidAmount(next.currentBidAmount);
      if (next.bidCount > 0) setBidCount(next.bidCount);
      setIsHighBidder(next.isHighBidder);
      setMinNextBid(getMinNextBid(next.currentBidAmount, startingBid));
      setFlash(true);
      setTimeout(() => setFlash(false), 1200);
      poll();
    },
    [poll, startingBid],
  );

  useEffect(() => {
    if (!isBiddable) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(poll, POLL_MS);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') { poll(); start(); }
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [isBiddable, poll]);

  const hasBid = currentBidAmount > 0;

  return (
    <div>
      {hasBid ? (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Current Bid</p>
          <p className={`font-display text-display-md transition-colors duration-500 ${flash ? 'text-champagne' : ''}`}>
            {formatCurrency(currentBidAmount)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{bidCount} bid{bidCount !== 1 ? 's' : ''}</p>
        </div>
      ) : estimateLow && estimateHigh ? (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Estimate</p>
          <p className="font-display text-display-md">
            {formatCurrency(estimateLow)} — {formatCurrency(estimateHigh)}
          </p>
        </div>
      ) : null}

      {isBiddable && closingAt && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Closes in</span>
          <AuctionCountdown
            endsAt={new Date(closingAt)}
            serverNow={serverNow}
            // Don't hide the bid form on a local-clock expiry — an anti-snipe
            // extension may have landed since the last poll. Poll once to
            // confirm; the server response updates closingAt/isBiddable.
            onExpired={() => { poll(); }}
            variant="inline"
          />
        </div>
      )}

      {isBiddable && (
        <div className="mt-5 border-t border-border/30 pt-5">
          <BidForm
            lotRef={lotRef}
            currentBidAmount={currentBidAmount}
            minNextBid={minNextBid}
            isHighBidder={isHighBidder}
            onBidPlaced={handleBidPlaced}
          />
        </div>
      )}
    </div>
  );
}
