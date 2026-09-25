'use client';

import { useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Gavel, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { BidForm } from '@/components/lots/BidForm';
import { formatCurrency } from '@/types';
import { cn } from '@/lib/utils';
import { lotRef, type LiveLot, type LiveLotPhase } from './live-lots';

const PHASE_LABEL: Record<Exclude<LiveLotPhase, 'open'>, string> = {
  upcoming: 'Opens soon',
  closed: 'Closed',
  sold: 'Sold',
  passed: 'Passed',
};

function priceSummary(lot: LiveLot): { amount: string | null; note: string } {
  if (lot.currentBidAmount > 0) {
    return { amount: formatCurrency(lot.currentBidAmount), note: `${lot.bidCount} bid${lot.bidCount === 1 ? '' : 's'}` };
  }
  if (lot.estimateLow) {
    return { amount: null, note: `Est. ${formatCurrency(lot.estimateLow)}–${formatCurrency(lot.estimateHigh ?? lot.estimateLow)}` };
  }
  return { amount: null, note: 'No bids yet' };
}

interface LiveLotSummaryProps {
  lot: LiveLot;
  onTheBlock: boolean;
  signedIn: boolean;
  signInHref: string;
  onBid: () => void;
  className?: string;
}

/**
 * The lot being shown, its bid status and the bid action. One grid, three
 * arrangements: a single row on a portrait phone, two stacked rows in the
 * narrow landscape side panel, and the roomier desktop card with the price
 * block on the right.
 */
export function LiveLotSummary({ lot, onTheBlock, signedIn, signInHref, onBid, className }: LiveLotSummaryProps) {
  const { amount, note } = priceSummary(lot);

  return (
    <section
      aria-label={`Lot ${lot.lotNumber}`}
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3',
        'max-lg:landscape:grid-cols-[minmax(0,1fr)_auto] max-lg:landscape:gap-y-2 max-lg:landscape:px-3',
        'lg:gap-x-4 lg:py-4',
        className,
      )}
    >
      <div className="relative col-start-1 row-span-2 row-start-1 size-14 overflow-hidden rounded bg-white/5 max-lg:landscape:hidden lg:size-20">
        {lot.imageUrl && (
          // Always on screen when the room opens, and tiny: no reason to lazy-load.
          <Image src={lot.imageUrl} alt="" fill loading="eager" sizes="(min-width: 1024px) 80px, 56px" className="object-cover" />
        )}
      </div>

      <div className="col-start-2 row-start-1 min-w-0 max-lg:landscape:col-span-2 max-lg:landscape:col-start-1 lg:row-span-2 lg:self-center">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {onTheBlock && lot.phase === 'open' && (
            <span aria-hidden className="mr-1.5 inline-block size-1.5 rounded-full bg-red-500 align-[0.15em] motion-safe:animate-pulse" />
          )}
          Lot {lot.lotNumber}
          {onTheBlock && lot.phase === 'open' && (
            // Spelled out where it fits; a narrow portrait phone shows the dot.
            <span className="text-champagne max-sm:sr-only"> · On the block</span>
          )}
        </p>
        <p className="truncate text-[15px] font-medium leading-snug text-foreground lg:text-base">{lot.title}</p>
        {lot.estimateLow && (
          <p className="mt-1 hidden text-xs text-muted-foreground lg:block">
            Est. {formatCurrency(lot.estimateLow)}–{formatCurrency(lot.estimateHigh ?? lot.estimateLow)}
          </p>
        )}
      </div>

      <p
        aria-live="polite"
        className="col-start-2 row-start-2 min-w-0 truncate text-sm max-lg:landscape:col-start-1 lg:col-start-3 lg:row-start-1 lg:text-right"
      >
        {amount ? (
          <>
            <span className="hidden text-xs text-muted-foreground lg:block">Current bid</span>
            <span className="font-display text-base text-champagne lg:block lg:text-2xl">{amount}</span>
            <span className="text-muted-foreground lg:block lg:text-xs">
              <span className="lg:hidden"> · </span>
              {note}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">{note}</span>
        )}
      </p>

      <div className="col-start-3 row-span-2 row-start-1 justify-self-end max-lg:landscape:col-start-2 max-lg:landscape:row-span-1 max-lg:landscape:row-start-2 lg:row-span-1 lg:row-start-2 lg:mt-2">
        <BidAction lot={lot} signedIn={signedIn} signInHref={signInHref} onBid={onBid} />
      </div>
    </section>
  );
}

function BidAction({
  lot,
  signedIn,
  signInHref,
  onBid,
}: {
  lot: LiveLot;
  signedIn: boolean;
  signInHref: string;
  onBid: () => void;
}) {
  if (lot.phase !== 'open') {
    return (
      <span className="inline-flex h-11 items-center rounded-md border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {PHASE_LABEL[lot.phase]}
      </span>
    );
  }
  if (!signedIn) {
    return (
      <Button asChild className="h-11 px-4">
        <Link href={signInHref}>Sign in to bid</Link>
      </Button>
    );
  }
  if (lot.isHighBidder) {
    return (
      <Button
        variant="outline"
        onClick={onBid}
        className="h-11 gap-1.5 border-green-500/40 px-4 text-green-400 hover:text-green-300"
      >
        <Check aria-hidden className="size-4" /> Leading
        <span className="sr-only">: you hold the high bid. Open bidding to set a maximum.</span>
      </Button>
    );
  }
  return (
    <Button onClick={onBid} className="h-11 gap-1.5 px-4 font-semibold tabular-nums">
      <Gavel aria-hidden className="size-4" /> Bid {formatCurrency(lot.minNextBid)}
    </Button>
  );
}

// ─── Bid sheet ───────────────────────────────────────────────────────────────

const WIDE_QUERY = '(orientation: landscape), (min-width: 1024px)';

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

interface LiveBidSheetProps {
  /** The lot the sheet was opened for. Stays bound to it even if the sale moves on. */
  lot: LiveLot | undefined;
  buyerPremiumPercent: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBidPlaced: () => void;
}

/**
 * The full bid form (quick bids, custom amount, max bid, verification) in a
 * sheet over the stream: from the bottom on a portrait phone, from the side
 * in landscape and on desktop. It keeps the light site styling the form was
 * designed for, which also sets it apart from the dark saleroom.
 */
export function LiveBidSheet({ lot, buyerPremiumPercent, open, onOpenChange, onBidPlaced }: LiveBidSheetProps) {
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
  const router = useRouter();
  if (!lot) return null;
  const { amount, note } = priceSummary(lot);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        showCloseButton={false}
        className={cn(
          'gap-0 overflow-y-auto overscroll-contain px-5 pt-4 motion-reduce:animate-none',
          wide
            ? 'pb-[max(1.25rem,env(safe-area-inset-bottom))] pr-[max(1.25rem,env(safe-area-inset-right))]'
            : 'max-h-[90dvh] rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]',
        )}
      >
        <div className="flex items-start gap-3">
          {lot.imageUrl && (
            <div className="relative size-14 shrink-0 overflow-hidden rounded bg-muted">
              <Image src={lot.imageUrl} alt="" fill sizes="56px" className="object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-eyebrow text-champagne-deep">Lot {lot.lotNumber}</p>
            <SheetTitle className="mt-0.5 font-display text-lg leading-snug">{lot.title}</SheetTitle>
            <SheetDescription className="mt-0.5">
              {amount ? `Current bid ${amount} · ${note}` : note}
            </SheetDescription>
          </div>
          <SheetClose className="-mr-3 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X aria-hidden className="size-5" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>

        <div className="mt-5">
          {lot.phase === 'open' ? (
            <BidForm
              lotRef={lotRef(lot)}
              lotTitle={lot.title}
              buyerPremiumPercent={buyerPremiumPercent}
              currentBidAmount={lot.currentBidAmount}
              minNextBid={lot.minNextBid}
              isHighBidder={lot.isHighBidder}
              onBidPlaced={onBidPlaced}
              // A refused bid means the room's figures are stale. BidForm
              // holds the engine's minimum meanwhile; this fetches the rest.
              onRejected={() => router.refresh()}
            />
          ) : (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Bidding has closed for this lot.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
