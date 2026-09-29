'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Gavel } from 'lucide-react';
import { formatCurrency } from '@/types';
import { formatEstimate } from '@/lib/format/estimate';
import { Button } from '@/components/ui/button';
import { AuctionCountdown } from '@/components/auctions/AuctionCountdown';
import { BidForm } from '@/components/lots/BidForm';
import { MobileActionBar, scrollIntoViewBelowNav } from '@/components/lots/MobileActionBar';
import { getMinNextBid } from '@/lib/bidding/bid-increments';
import { useRealtimeTopic } from '@/hooks/useRealtimeTopic';

interface LiveLotPanelProps {
  lotId: string; // uuid — realtime topic
  lotRef: string; // slug or id used for the state endpoint
  lotTitle: string;
  initialCurrentBidAmount: number;
  initialBidCount: number;
  startingBid: number;
  estimateLow: number | null;
  estimateHigh: number | null;
  closingAt: string | null; // ISO
  serverNow: number; // ms since epoch, captured server-side at render
  initialIsBiddable: boolean;
  initialIsHighBidder: boolean;
  /** Whether the server saw a session at render; refined once the bid form checks. */
  viewerSignedIn: boolean;
  buyerPremiumPercent?: number | null;
  /** The sale's LiveAuctioneers page: the CTA when on-site bidding is closed, a secondary link otherwise. */
  externalBidUrl?: string | null;
  /** Shown when the lot can't be bid on anywhere. */
  unavailableNote?: string | null;
  /** The lot row's status at render; polls refresh it while biddable. */
  lotStatus?: string;
  /** Recorded hammer price, shown once the lot is sold. */
  hammerPrice?: number | null;
  /** Bidding is over (sold, unsold or past its close), as opposed to not yet open. */
  biddingClosed?: boolean;
  /**
   * The sale runs on LiveAuctioneers and is still in progress: passing the
   * scheduled close time doesn't end it, only a sold/unsold result does.
   */
  externalSaleInProgress?: boolean;
  /**
   * When bidding opens, for a lot whose sale hasn't started — already
   * formatted by the server ("Thu, November 5 at 7:00 PM ET"), so the
   * hydrated text is byte-for-byte the server's.
   */
  opensAtLabel?: string | null;
}

// The one small-caps label style in the panel and its phone bar.
const LABEL = 'text-xs uppercase tracking-wider text-muted-foreground';

// Polling is the fallback; while the realtime channel is connected every bid
// arrives as a push and the poll only reconciles (clock drift, missed events).
// Disconnected (or re-joining after a resume) the poll carries the page.
const POLL_MS = 5000;
const POLL_MS_REALTIME = 30000;
// How long a rejection's minimum outranks a (possibly lagging) poll.
const MIN_FLOOR_MS = 60000;

/**
 * Live-updating price + countdown for a lot. Polls the lightweight lot-state
 * endpoint while the tab is visible and the lot is still biddable, so a bidder
 * watching the final minutes sees the current bid and time-to-close move in
 * near-real-time instead of a frozen server snapshot. The countdown is corrected
 * for device clock skew with the server clock each poll returns (see AuctionCountdown).
 *
 * On phones it also drives the sticky bid bar, which stands in for the panel's
 * call to action whenever that is scrolled out of view.
 */
export function LiveLotPanel({
  lotId,
  lotRef,
  lotTitle,
  initialCurrentBidAmount,
  initialBidCount,
  startingBid,
  estimateLow,
  estimateHigh,
  closingAt: initialClosingAt,
  serverNow,
  initialIsBiddable,
  initialIsHighBidder,
  viewerSignedIn,
  buyerPremiumPercent,
  externalBidUrl,
  unavailableNote,
  lotStatus: initialLotStatus,
  hammerPrice = null,
  biddingClosed = false,
  externalSaleInProgress = false,
  opensAtLabel = null,
}: LiveLotPanelProps) {
  const [currentBidAmount, setCurrentBidAmount] = useState(initialCurrentBidAmount);
  const [bidCount, setBidCount] = useState(initialBidCount);
  const [minNextBid, setMinNextBid] = useState(getMinNextBid(initialCurrentBidAmount, startingBid));
  const [isHighBidder, setIsHighBidder] = useState(initialIsHighBidder);
  const [closingAt, setClosingAt] = useState(initialClosingAt);
  const [isBiddable, setIsBiddable] = useState(initialIsBiddable);
  const [lotStatus, setLotStatus] = useState(initialLotStatus);
  const [closed, setClosed] = useState(biddingClosed);
  const [flash, setFlash] = useState(false);
  // Server-minus-device clock offset from the fastest poll so far (see poll).
  const [clockOffsetMs, setClockOffsetMs] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(viewerSignedIn);
  // The panel's primary action (quick bids / Sign in / LiveAuctioneers): the
  // phone bid bar shows only while it is off screen.
  const [ctaEl, setCtaEl] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const prevBid = useRef(initialCurrentBidAmount);
  const bestRttRef = useRef(Infinity);
  // The bid engine's minimum from a rejection. The state endpoint reads the
  // denormalized lot row, which can trail the engine by a moment; a poll
  // must not hand the stale, lower minimum back to the quick bids.
  const minFloorRef = useRef<{ value: number; at: number } | null>(null);

  const poll = useCallback(async () => {
    try {
      const sentAt = Date.now();
      const res = await fetch(`/api/lots/${encodeURIComponent(lotRef)}/state`, { cache: 'no-store' });
      const receivedAt = Date.now();
      if (!res.ok) return;
      const { data } = await res.json();
      if (!data) return;
      // The server stamped its clock somewhere inside the round trip; assume
      // the middle. Keep the sample with the smallest round trip — it bounds
      // the error tightest.
      const rtt = receivedAt - sentAt;
      if (typeof data.serverNow === 'number' && rtt >= 0 && rtt <= bestRttRef.current) {
        bestRttRef.current = rtt;
        setClockOffsetMs(Math.round(data.serverNow + rtt / 2 - receivedAt));
      }
      if (typeof data.currentBidAmount === 'number' && data.currentBidAmount !== prevBid.current) {
        prevBid.current = data.currentBidAmount;
        setCurrentBidAmount(data.currentBidAmount);
        setFlash(true);
        setTimeout(() => setFlash(false), 1200);
      }
      if (typeof data.bidCount === 'number') setBidCount(data.bidCount);
      if (typeof data.minNextBid === 'number') {
        const floor = minFloorRef.current;
        const fresh = floor && Date.now() - floor.at < MIN_FLOOR_MS ? floor.value : 0;
        setMinNextBid(Math.max(data.minNextBid, fresh));
      }
      if (typeof data.isHighBidder === 'boolean') setIsHighBidder(data.isHighBidder);
      if (data.closingAt !== undefined) setClosingAt(data.closingAt);
      if (typeof data.lotStatus === 'string') setLotStatus(data.lotStatus);
      if (typeof data.isBiddable === 'boolean') {
        setIsBiddable(data.isBiddable);
        // Stopped because the clock ran out or the lot settled (not paused):
        // the panel switches from "Current Bid" to its closed state.
        const ranOut =
          typeof data.closingAt === 'string' &&
          typeof data.serverNow === 'number' &&
          Date.parse(data.closingAt) <= data.serverNow;
        if (!data.isBiddable && ((ranOut && !externalSaleInProgress) || data.lotStatus === 'sold' || data.lotStatus === 'unsold')) {
          setClosed(true);
        }
      }
    } catch {
      // transient network error — keep the last known values
    }
  }, [lotRef, externalSaleInProgress]);

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

  // A refused bid means our view was stale. Take the engine's minimum at
  // once (so the quick bids move before the next tap) and fetch the rest.
  const handleBidRejected = useCallback(
    ({ minRequired }: { minRequired?: number }) => {
      if (typeof minRequired === 'number') {
        minFloorRef.current = { value: minRequired, at: Date.now() };
        setMinNextBid((m) => Math.max(m, minRequired));
      }
      poll();
    },
    [poll],
  );

  // Push updates: the bids route and the settlement cron broadcast on
  // `lot:<id>` (receive-only private channel). Every event is just a cue to
  // refetch authoritative state — the payload itself is never rendered.
  const onRealtimeEvent = useCallback(() => { poll(); }, [poll]);
  // Back from a locked phone / bfcache / a network drop: the socket is being
  // re-joined and anything may have happened meanwhile. Refetch now and
  // re-measure the clock (the device may have re-synced while asleep).
  const onResume = useCallback(() => {
    bestRttRef.current = Infinity;
    poll();
  }, [poll]);
  const { connected } = useRealtimeTopic(isBiddable ? `lot:${lotId}` : null, onRealtimeEvent, { onResume });
  const pollMs = connected ? POLL_MS_REALTIME : POLL_MS;

  // One poll straight away: the render-time snapshot has aged by the network
  // and hydration delay, and it gives the countdown a measured clock offset.
  useEffect(() => {
    if (!initialIsBiddable) return;
    const t = setTimeout(poll, 0);
    return () => clearTimeout(t);
  }, [initialIsBiddable, poll]);

  useEffect(() => {
    if (!isBiddable) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(poll, pollMs);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    // The immediate refetch on return is the realtime hook's onResume.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [isBiddable, poll, pollMs]);

  const hasBid = currentBidAmount > 0;
  const ended = !isBiddable && (closed || lotStatus === 'sold');
  // Only a recorded hammer price is shown as a result — never the last bid,
  // which may not have met the reserve.
  const soldFor = ended && lotStatus === 'sold' && hammerPrice ? hammerPrice : null;
  const upcoming = !isBiddable && !ended && !!opensAtLabel;
  const estimateText = formatEstimate(estimateLow, estimateHigh);
  // After a label word ("Estimate up to $2,000"); the standalone figure keeps "Up to".
  const estimateInline = estimateText?.replace(/^Up to/, 'up to') ?? null;
  const barAction: 'bid' | 'signin' | 'external' | null = isBiddable
    ? signedIn ? 'bid' : 'signin'
    : externalBidUrl && !ended ? 'external' : null;
  const signInHref = `/login?next=${encodeURIComponent(`/lots/${lotRef}`)}`;

  // Bar: bring the bid form up and put the cursor in the amount field. The
  // focus happens inside the tap so iOS raises the keyboard.
  const goToBidForm = () => {
    // 32px: the card's own padding plus a little air under the nav.
    if (panelRef.current) scrollIntoViewBelowNav(panelRef.current, 32);
    amountInputRef.current?.focus({ preventScroll: true });
  };

  const barPrice = hasBid
    ? { label: 'Current bid', value: formatCurrency(currentBidAmount) }
    : estimateText
      ? { label: 'Estimate', value: estimateText }
      : startingBid > 0
        ? { label: 'Opening bid', value: formatCurrency(startingBid) }
        : null;
  const bidsText = hasBid ? `${bidCount} bid${bidCount !== 1 ? 's' : ''}` : isBiddable ? 'No bids' : null;

  return (
    <div ref={panelRef}>
      {/* Price block: the result once it's over, else the live bid, else the
          estimate, else the opening bid. The estimate stays as a reference line. */}
      {soldFor ? (
        <div>
          <p className={`${LABEL} mb-1`}>Sold for</p>
          <p className="font-display text-display-md">{formatCurrency(soldFor)}</p>
          <p className="text-sm text-muted-foreground mt-1">Hammer price, before buyer&apos;s premium</p>
          {estimateInline && <p className="text-sm text-muted-foreground">Estimate {estimateInline}</p>}
        </div>
      ) : ended ? (
        <div>
          <p className="font-display text-display-sm">Bidding closed</p>
          {estimateInline && <p className="text-sm text-muted-foreground mt-1">Estimate {estimateInline}</p>}
        </div>
      ) : hasBid ? (
        <div>
          <p className={`${LABEL} mb-1`}>Current Bid</p>
          <p className={`font-display text-display-md transition-colors duration-500 ${flash ? 'text-champagne' : ''}`}>
            {formatCurrency(currentBidAmount)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {bidCount} bid{bidCount !== 1 ? 's' : ''}
            {estimateInline && <> · Estimate {estimateInline}</>}
          </p>
        </div>
      ) : estimateText ? (
        <div>
          <p className={`${LABEL} mb-1`}>Estimate</p>
          <p className="font-display text-display-md">{estimateText}</p>
          {startingBid > 0 && (
            <p className="text-sm text-muted-foreground mt-1">Opening bid {formatCurrency(startingBid)}</p>
          )}
        </div>
      ) : startingBid > 0 ? (
        <div>
          <p className={`${LABEL} mb-1`}>Opening Bid</p>
          <p className="font-display text-display-md">{formatCurrency(startingBid)}</p>
        </div>
      ) : null}

      {upcoming && opensAtLabel && (
        <div className="mt-4">
          <p className={`${LABEL} mb-1`}>Bidding opens</p>
          <p className="font-medium">{opensAtLabel}</p>
        </div>
      )}

      {isBiddable && closingAt && (
        <div className="mt-4 flex items-center gap-2">
          <span className={LABEL}>Closes in</span>
          <AuctionCountdown
            endsAt={new Date(closingAt)}
            serverNow={serverNow}
            clockOffsetMs={clockOffsetMs}
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
            lotTitle={lotTitle}
            currentBidAmount={currentBidAmount}
            minNextBid={minNextBid}
            isHighBidder={isHighBidder}
            buyerPremiumPercent={buyerPremiumPercent}
            onBidPlaced={handleBidPlaced}
            onRejected={handleBidRejected}
            onAuthResolved={setSignedIn}
            primaryRef={setCtaEl}
            amountInputRef={amountInputRef}
          />
        </div>
      )}

      {/* When the lot is biddable on-site, the bid form above is the primary
          CTA. Otherwise fall back to LiveAuctioneers or an informational note;
          once bidding is over the price block says so and nothing is offered. */}
      {!isBiddable && !ended && (
        externalBidUrl ? (
          <div ref={setCtaEl} className="mt-5">
            <Button asChild variant="champagne" size="xl" className="w-full gap-2">
              <a href={externalBidUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-5 w-5" />
                Bid on LiveAuctioneers
              </a>
            </Button>
          </div>
        ) : upcoming ? (
          // The watchlist email goes out as a lot nears its close (see
          // lib/bidding/ending-soon.ts); there is no "bidding opened" email.
          <p className="mt-5 text-sm text-muted-foreground">
            Watch this lot to get an email before it closes.
          </p>
        ) : unavailableNote ? (
          <p className="mt-5 text-sm text-muted-foreground">{unavailableNote}</p>
        ) : null
      )}
      {/* Secondary link to LiveAuctioneers even while biddable on-site */}
      {isBiddable && externalBidUrl && (
        <a
          href={externalBidUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex min-h-11 items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Also available on LiveAuctioneers
        </a>
      )}

      <MobileActionBar target={ctaEl} enabled={barAction !== null} label="Bid on this lot">
        <div className="min-w-0 flex-1">
          {/* Label row carries the clock so the price gets the full width. */}
          <div className={`flex items-center gap-2 ${LABEL}`}>
            <span className="min-w-0 truncate">
              {barPrice?.label ?? 'Lot'}
              {bidsText && <> · {bidsText}</>}
            </span>
            {isBiddable && closingAt && (
              <AuctionCountdown
                endsAt={new Date(closingAt)}
                serverNow={serverNow}
                clockOffsetMs={clockOffsetMs}
                variant="compact"
                className="ml-auto shrink-0 text-xs normal-case tracking-normal"
              />
            )}
          </div>
          {barPrice && (
            <p className={`font-display text-xl leading-tight tabular-nums truncate transition-colors duration-500 ${flash ? 'text-champagne' : ''}`}>
              {barPrice.value}
            </p>
          )}
        </div>
        {barAction === 'bid' ? (
          <Button type="button" variant="champagne" className="h-12 shrink-0 gap-2 rounded-lg px-5 text-[15px]" onClick={goToBidForm}>
            <Gavel className="h-4 w-4" />
            Place Bid
          </Button>
        ) : barAction === 'signin' ? (
          <Button asChild variant="champagne" className="h-12 shrink-0 gap-2 rounded-lg px-5 text-[15px]">
            <Link href={signInHref}>
              <Gavel className="h-4 w-4" />
              Sign in to Bid
            </Link>
          </Button>
        ) : barAction === 'external' && externalBidUrl ? (
          <Button asChild variant="champagne" className="h-12 shrink-0 gap-2 rounded-lg px-4 text-[15px]">
            <a href={externalBidUrl} target="_blank" rel="noopener noreferrer">
              Bid on LiveAuctioneers
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        ) : null}
      </MobileActionBar>
    </div>
  );
}
