'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LiveVideoPlayer } from './LiveVideoPlayer';
import { LiveViewerLayout } from './LiveViewerLayout';
import { liveSignInHref, pickCurrentLot, type LiveLot, type LiveViewer } from './live-lots';
import { useRealtimeTopic } from '@/hooks/useRealtimeTopic';
import { useLiveChat } from '@/hooks/useLiveChat';

interface LiveAuctionViewerProps {
  auction: { id: string; title: string; slug: string; buyerPremiumPercent: number | null };
  lots: LiveLot[];
  viewer: LiveViewer;
}

export function LiveAuctionViewer({ auction, lots, viewer }: LiveAuctionViewerProps) {
  const router = useRouter();
  const chat = useLiveChat(auction.id);
  const signInHref = liveSignInHref(auction.id);

  // Push: the bids route / settlement cron broadcast lot_bid / lot_closed on
  // the auction's private channel. Chat shares that channel, so only lot
  // events refresh, and bursts coalesce into one soft refresh.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 250);
  }, [router]);
  const onLiveEvent = useCallback(
    (event: string) => {
      if (event.startsWith('lot_')) scheduleRefresh();
    },
    [scheduleRefresh],
  );
  // onResume is the single "came back" path (tab shown again, bfcache
  // restore, network back): events may have been missed, so refetch.
  const { connected } = useRealtimeTopic(`live:${auction.id}`, onLiveEvent, { onResume: scheduleRefresh });

  // Lot bid amounts / counts are server-rendered props. While the channel is
  // up every bid arrives as a push, so the poll is only a slow
  // reconciliation; while it's down, polling carries the sale. Hidden tabs
  // skip the tick (onResume catches up when they return).
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, connected ? 30000 : 5000);
    return () => clearInterval(timer);
  }, [router, connected]);

  // A lot's close time passing changes what's biddable and which lot is on
  // the block; refresh right then rather than waiting for the next tick.
  const current = pickCurrentLot(lots);
  const nextCloseAt = current?.phase === 'open' ? current.closingAt : null;
  useEffect(() => {
    if (!nextCloseAt) return;
    const delay = Date.parse(nextCloseAt) - Date.now() + 1500;
    if (!(delay > 0 && delay < 2 ** 31 - 1)) return;
    const timer = setTimeout(scheduleRefresh, delay);
    return () => clearTimeout(timer);
  }, [nextCloseAt, scheduleRefresh]);

  return (
    <LiveViewerLayout
      auction={auction}
      lots={lots}
      viewer={viewer}
      chat={chat}
      signInHref={signInHref}
      onBidPlaced={() => router.refresh()}
      video={<LiveVideoPlayer auctionId={auction.id} signedIn={viewer.signedIn} signInHref={signInHref} />}
    />
  );
}
