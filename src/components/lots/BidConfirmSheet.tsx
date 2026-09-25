'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Loader2, Gavel, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency } from '@/types';
import { BELOW_DESKTOP_QUERY, useMediaQuery } from './MobileActionBar';

interface BidConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lotTitle: string;
  /** The amount the primary action sends (cents), shown large. */
  amount: number;
  /** Proxy maximum that rides along with the bid, if any (cents). */
  maxAmount?: number;
  buyerPremiumPercent?: number | null;
  submitting: boolean;
  /** Why the bid needs another look (the minimum moved, an unconfirmed send); shown above the actions. */
  notice?: ReactNode;
  /**
   * The primary action's label, naming the amount it sends ("Confirm $1,000",
   * "Bid $1,100 instead"). Null when the bid can't be sent as is.
   */
  actionLabel: string | null;
  onAction: () => void;
}

// A primary action that changes while the sheet is open (Confirm giving way
// to "Bid $1,100 instead") is held this long, so a tap already on its way
// to the old button can't land on the new one.
const CHANGED_ACTION_HOLD_MS = 1000;

/** True for a moment after `actionKey` changes; never on mount. */
function useHeldAfterChange(actionKey: string): boolean {
  const [settledKey, setSettledKey] = useState(actionKey);
  useEffect(() => {
    const t = setTimeout(() => setSettledKey(actionKey), CHANGED_ACTION_HOLD_MS);
    return () => clearTimeout(t);
  }, [actionKey]);
  return settledKey !== actionKey;
}

/**
 * The deliberate second step before a binding bid: a bottom sheet on phones
 * (thumb-reachable, keeps the lot page visible behind it) and a centred
 * dialog on desktop. States the lot, the amount, the premium and that bids
 * are binding.
 */
export function BidConfirmSheet(props: BidConfirmSheetProps) {
  const isPhone = useMediaQuery(BELOW_DESKTOP_QUERY);
  const { open, onOpenChange, submitting } = props;
  // The caller clears its bid the moment the sheet closes, but the sheet is
  // still animating out; keep showing what it last showed while open so it
  // never flashes "Confirm $0". Keyed on primitives so this settles at once.
  const viewKey = `${props.amount}|${props.maxAmount ?? ''}|${props.actionLabel ?? ''}|${props.lotTitle}`;
  const [lastOpen, setLastOpen] = useState<{ key: string; view: BidConfirmSheetProps } | null>(null);
  if (open && lastOpen?.key !== viewKey) setLastOpen({ key: viewKey, view: props });
  const body = open || !lastOpen ? props : { ...lastOpen.view, submitting: false, onAction: () => {} };
  // Focus lands on Cancel, not Confirm: a held or repeated Return from the
  // amount field must never place the bid by itself.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const focusCancel = (e: Event) => {
    e.preventDefault();
    cancelRef.current?.focus();
  };
  // A sheet mid-request can't be swiped or tapped away: the bid may land.
  const guardedChange = (next: boolean) => {
    if (!next && submitting) return;
    onOpenChange(next);
  };

  if (isPhone) {
    return (
      <Sheet open={open} onOpenChange={guardedChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          onOpenAutoFocus={focusCancel}
          className="gap-0 rounded-t-2xl border-border/60 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] motion-reduce:animate-none"
        >
          <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
          <ConfirmBody {...body} cancelRef={cancelRef} Title={SheetTitle} Description={SheetDescription} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={guardedChange}>
      <DialogContent showCloseButton={false} onOpenAutoFocus={focusCancel} className="gap-0 sm:max-w-md motion-reduce:animate-none">
        <ConfirmBody {...body} cancelRef={cancelRef} Title={DialogTitle} Description={DialogDescription} />
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  lotTitle,
  amount,
  maxAmount,
  buyerPremiumPercent,
  submitting,
  notice,
  actionLabel,
  onAction,
  onOpenChange,
  cancelRef,
  Title,
  Description,
}: BidConfirmSheetProps & {
  cancelRef: RefObject<HTMLButtonElement | null>;
  Title: typeof SheetTitle | typeof DialogTitle;
  Description: typeof SheetDescription | typeof DialogDescription;
}) {
  const premium = buyerPremiumPercent ? Math.round((amount * buyerPremiumPercent) / 100) : null;
  const held = useHeldAfterChange(actionLabel ?? '');

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <p className="text-eyebrow text-champagne-deep dark:text-champagne">Confirm your bid</p>
        <Title className="font-display text-lg font-normal leading-snug text-foreground line-clamp-2">{lotTitle}</Title>
      </div>

      <div className="border-y border-border/60 py-4">
        <p className="font-display text-4xl leading-none tabular-nums">{formatCurrency(amount)}</p>
        {maxAmount !== undefined && (
          <p className="mt-2 text-sm text-muted-foreground">
            Maximum (proxy) bid: <span className="text-foreground tabular-nums">{formatCurrency(maxAmount)}</span>
          </p>
        )}
        {premium !== null && (
          <p className="mt-2 text-sm text-muted-foreground">
            Plus {buyerPremiumPercent}% buyer&apos;s premium ({formatCurrency(premium)}):{' '}
            <span className="text-foreground tabular-nums">{formatCurrency(amount + premium)}</span> if this bid wins, before tax and shipping.
          </p>
        )}
      </div>

      {notice && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{notice}</span>
        </p>
      )}

      <Description className="text-[13px] leading-relaxed">
        <span className="font-medium text-foreground">Bids are binding.</span> If yours wins, you are committed to buy
        this lot at your bid plus the buyer&apos;s premium.
      </Description>

      <div className="flex flex-col gap-2.5 sm:flex-row-reverse">
        <Button
          // A new element per action: focus, and a pressed state, never carry
          // over from Confirm to a different amount.
          key={actionLabel ?? 'none'}
          type="button"
          variant="champagne"
          size="xl"
          className="h-12 w-full gap-2 px-6 sm:flex-1"
          disabled={submitting || !actionLabel || held}
          onClick={onAction}
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Gavel className="h-5 w-5" />}
          {submitting ? 'Placing bid…' : (actionLabel ?? `Confirm ${formatCurrency(amount)}`)}
        </Button>
        <Button
          ref={cancelRef}
          type="button"
          variant="outline"
          size="xl"
          className="h-12 w-full px-6 sm:flex-1"
          disabled={submitting}
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
