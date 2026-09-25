import { formatCurrency } from '@/types';

/**
 * The bid confirmation's rules, kept pure so they can be tested without a
 * DOM: which minimum the form enforces, what the sheet's primary action may
 * send when the price moves under it, and which idempotency key a send uses.
 *
 * The one invariant: an action never sends an amount the bidder didn't see
 * on it. Confirm always sends the bid they chose; a higher amount is only
 * ever a separate, explicitly labelled choice.
 */

export interface BidDraft {
  amount: number; // cents
  max?: number; // cents
}

// ─── Minimum ────────────────────────────────────────────────────────────────

/** The bid engine's minimum from a rejection, for one lot. */
export interface MinFloor {
  lotRef: string;
  value: number; // cents
}

/**
 * How long a floor holds. Long enough for any poll or live-room refresh to
 * catch up; short enough that a voided bid can't pin the form above the
 * real minimum.
 */
export const MIN_FLOOR_MS = 60_000;

/**
 * The minimum the form enforces. The lot's figures can trail the engine by
 * a poll interval or a refresh, so a rejection's `minRequired` raises the
 * minimum at once. It never lowers it, and gives way as soon as the lot's
 * own minimum reaches it.
 */
export function effectiveMinimum(minNextBid: number, floor: MinFloor | null, lotRef: string): number {
  return floor && floor.lotRef === lotRef ? Math.max(minNextBid, floor.value) : minNextBid;
}

/** Take a rejection's minimum without ever lowering this lot's existing floor. */
export function raiseFloor(prev: MinFloor | null, lotRef: string, minRequired: number): MinFloor {
  return { lotRef, value: prev && prev.lotRef === lotRef ? Math.max(prev.value, minRequired) : minRequired };
}

// ─── Idempotency ────────────────────────────────────────────────────────────

/** One bid as the server's idempotency sees it. The lot is part of it: a key must never replay across lots. */
export const bidSignature = (lotRef: string, bid: BidDraft) => `${lotRef}|${bid.amount}|${bid.max ?? ''}`;

export interface Attempt {
  sig: string;
  key: string;
}

/**
 * The attempt a send belongs to. Resending the bid whose last send got no
 * answer replays its key, so the server hands back the original bid if it
 * landed; any other bid is a new attempt with a new key.
 */
export function attemptFor(prev: Attempt | null, sig: string, newKey: () => string): Attempt {
  return prev && prev.sig === sig ? prev : { sig, key: newKey() };
}

/** A send with no definitive answer (5xx, network drop): it may have landed. */
export interface Unanswered {
  lotRef: string;
  bid: BidDraft;
}

// ─── What the sheet offers ──────────────────────────────────────────────────

export type ConfirmKind =
  /** Send exactly the bid the bidder chose. */
  | 'confirm'
  /**
   * The minimum passed the chosen bid while the sheet was open. Confirm is
   * withdrawn and the new minimum is offered as a separate choice.
   */
  | 'reoffer'
  /**
   * As 'reoffer', but the chosen bid's last send got no answer, so it may
   * have landed. Only the same bid is offered again: its replayed key
   * returns the original if it landed, or a clean rejection if it didn't.
   */
  | 'retry'
  /** The proxy maximum no longer covers the minimum: nothing can be sent as is. */
  | 'blocked';

export interface ConfirmPlan {
  kind: ConfirmKind;
  /** What the primary action sends; null when nothing can be sent. */
  send: BidDraft | null;
  /** The bid shown large: what the action sends, else the bidder's own. */
  shown: BidDraft;
  /** The primary action's label; null when nothing can be sent. */
  label: string | null;
  notice: string | null;
  /** A different bid on this lot got no answer: warn before placing another. */
  earlierUnconfirmed: boolean;
}

export const minimumMovedNotice = (minimum: number) =>
  `Another bid came in. The minimum is now ${formatCurrency(minimum)}.`;

export function planConfirm({
  lotRef,
  pending,
  minimum,
  unanswered,
}: {
  lotRef: string;
  /** The bid the bidder chose. */
  pending: BidDraft;
  /** The lot's current minimum, as the form enforces it (see effectiveMinimum). */
  minimum: number;
  unanswered: Unanswered | null;
}): ConfirmPlan {
  const sameUnanswered = !!unanswered && bidSignature(unanswered.lotRef, unanswered.bid) === bidSignature(lotRef, pending);
  const earlierUnconfirmed = !!unanswered && unanswered.lotRef === lotRef && !sameUnanswered;
  const amount = formatCurrency(pending.amount);

  if (pending.amount >= minimum) {
    return {
      kind: 'confirm',
      send: pending,
      shown: pending,
      label: `Confirm ${amount}`,
      notice: sameUnanswered
        ? 'We couldn’t confirm your bid, so it may not have been placed. Trying again is safe: it can’t be placed twice.'
        : null,
      earlierUnconfirmed,
    };
  }
  if (sameUnanswered) {
    return {
      kind: 'retry',
      send: pending,
      shown: pending,
      label: `Retry ${amount}`,
      notice: `We couldn’t confirm your ${amount} bid, and the minimum is now ${formatCurrency(minimum)}. Try it again to find out whether it was placed: it can’t be placed twice.`,
      earlierUnconfirmed,
    };
  }
  if (pending.max !== undefined && pending.max < minimum) {
    return {
      kind: 'blocked',
      send: null,
      shown: pending,
      label: null,
      notice: `Another bid came in. The minimum is now ${formatCurrency(minimum)}, above your maximum. Cancel and raise your maximum to bid again.`,
      earlierUnconfirmed,
    };
  }
  const offer: BidDraft = pending.max !== undefined ? { amount: minimum, max: pending.max } : { amount: minimum };
  return {
    kind: 'reoffer',
    send: offer,
    shown: offer,
    label: `Bid ${formatCurrency(minimum)} instead`,
    notice: minimumMovedNotice(minimum),
    earlierUnconfirmed,
  };
}
