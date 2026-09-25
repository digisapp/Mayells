'use client';

import { useEffect, useRef, useState, type Ref, type RefObject } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/types';
import { getMinIncrement } from '@/lib/bidding/bid-increments';
import { Gavel, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { BidConfirmSheet } from './BidConfirmSheet';
import {
  attemptFor,
  bidSignature,
  effectiveMinimum,
  minimumMovedNotice,
  MIN_FLOOR_MS,
  planConfirm,
  raiseFloor,
  type Attempt,
  type BidDraft,
  type MinFloor,
  type Unanswered,
} from './bid-confirm';

interface BidFormProps {
  lotRef: string; // slug or id
  lotTitle: string;
  currentBidAmount: number; // cents (live)
  minNextBid: number; // cents (live)
  isHighBidder: boolean;
  /** The sale's buyer's premium, shown in the confirmation when known. */
  buyerPremiumPercent?: number | null;
  onBidPlaced: (next: { currentBidAmount: number; bidCount: number; isHighBidder: boolean }) => void;
  /** A bid was refused: apply the server's new minimum (when it sent one) and refresh the lot. */
  onRejected?: (info: { minRequired?: number }) => void;
  /** Whether the viewer turned out to be signed in (drives the phone bid bar's action). */
  onAuthResolved?: (signedIn: boolean) => void;
  /** Attached to the primary action (quick bids, or Sign in) — the phone bid bar watches it. */
  primaryRef?: Ref<HTMLDivElement>;
  /** The custom-amount field, so the bid bar can focus it. */
  amountInputRef?: RefObject<HTMLInputElement | null>;
}

interface AuthState {
  loading: boolean;
  loggedIn: boolean;
}

// Three ascending one-tap options starting at the minimum next bid.
function quickOptions(currentBidAmount: number, minNextBid: number): number[] {
  const inc = getMinIncrement(currentBidAmount > 0 ? currentBidAmount : minNextBid);
  return [minNextBid, minNextBid + inc, minNextBid + inc * 2];
}

// Whole dollars typed on a phone keypad (or pasted as "$1,250") → cents.
function dollarsToCents(value: string): number {
  return value ? Math.round(Number(value) * 100) : NaN;
}
const digitsOnly = (value: string) => value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');

// crypto.randomUUID is only defined in secure contexts / modern engines. Fall
// back to a random string so bidding still works on http staging or older
// in-app webviews instead of throwing and blocking the bid.
function genIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `bid-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function BidForm({
  lotRef,
  lotTitle,
  currentBidAmount,
  minNextBid,
  isHighBidder,
  buyerPremiumPercent,
  onBidPlaced,
  onRejected,
  onAuthResolved,
  primaryRef,
  amountInputRef,
}: BidFormProps) {
  const [auth, setAuth] = useState<AuthState>({ loading: true, loggedIn: false });
  // The bid awaiting confirmation; the sheet is open while this is set.
  const [pending, setPending] = useState<BidDraft | null>(null);
  // The engine's minimum from a rejection (see effectiveMinimum): the lot's
  // props can trail it by a poll, or by a live-room refresh.
  const [floor, setFloor] = useState<MinFloor | null>(null);
  // The last send that got no definitive answer; it may have landed.
  const [unanswered, setUnanswered] = useState<Unanswered | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showMax, setShowMax] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Verification gate. `verifyPrompt` is set when a bid is blocked pending a
  // higher tier; `verifying` covers the redirect to Stripe.
  const [paddleNumber, setPaddleNumber] = useState<string | null>(null);
  const [verifyPrompt, setVerifyPrompt] = useState<{ tier: string; reason: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const onAuthResolvedRef = useRef(onAuthResolved);
  useEffect(() => {
    onAuthResolvedRef.current = onAuthResolved;
  }, [onAuthResolved]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!active) return;
        setAuth({ loading: false, loggedIn: meRes.ok });
        onAuthResolvedRef.current?.(meRes.ok);
        if (meRes.ok) {
          const vRes = await fetch('/api/bidder/verification');
          if (active && vRes.ok) {
            const { data } = await vRes.json();
            setPaddleNumber(data?.paddleNumber ?? null);
          }
        }
      } catch {
        if (active) {
          setAuth({ loading: false, loggedIn: false });
          onAuthResolvedRef.current?.(false);
        }
      }
    })();
    return () => { active = false; };
  }, []);

  // Kick off card (Tier 2) or identity (Tier 3) verification and hand off to
  // the Stripe-hosted flow, returning to this lot afterward.
  async function startVerification(tier: 'card' | 'identity') {
    setVerifying(true);
    try {
      const endpoint = tier === 'identity' ? '/api/bidder/verify-identity' : '/api/bidder/verify-card';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo: `/lots/${lotRef}` }),
      });
      const json = await res.json();
      if (json?.data?.url) {
        window.location.href = json.data.url; // to Stripe
        return;
      }
      if (json?.data?.alreadyVerified) {
        setVerifyPrompt(null);
        setError('You are already verified — please try your bid again.');
      } else {
        setError(json?.error || 'Could not start verification.');
      }
    } catch {
      setError('Could not start verification. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  // A floor is dropped after a while (see MIN_FLOOR_MS); until then the
  // lot's own minimum overrides it only by reaching it.
  useEffect(() => {
    if (!floor) return;
    const t = setTimeout(() => setFloor(null), MIN_FLOOR_MS);
    return () => clearTimeout(t);
  }, [floor]);
  const minimum = effectiveMinimum(minNextBid, floor, lotRef);

  // One idempotency key per bid ATTEMPT (lot + amount + max), kept across
  // retries: if the request 500s or the network drops after the bid actually
  // landed, resending the same bid replays the same key and gets the original
  // bid back instead of placing another. Rotated when a different bid is sent
  // or the attempt resolves (success or clean rejection). A ref, not state:
  // the key must be settled synchronously inside the tap.
  const attemptRef = useRef<Attempt | null>(null);
  // One request at a time, even if two taps land before the re-render.
  const sendingRef = useRef(false);

  // Step one: validate locally, then ask for confirmation. Nothing is sent.
  function requestBid(amountCents: number, maxCents?: number) {
    setError(null);
    setSuccess(null);
    if (!Number.isFinite(amountCents) || amountCents < minimum) {
      setError(`Enter at least ${formatCurrency(minimum)}.`);
      return;
    }
    if (maxCents !== undefined && (!Number.isFinite(maxCents) || maxCents < amountCents)) {
      setError('Your max bid must be at least your bid amount.');
      return;
    }
    setPending(maxCents !== undefined ? { amount: amountCents, max: maxCents } : { amount: amountCents });
  }

  // While the sheet is open the price can move under it (a rival's bid, or
  // our own rejection raising the minimum). Confirm only ever sends the bid
  // the bidder chose; a higher amount is a separate, labelled choice.
  const plan = pending ? planConfirm({ lotRef, pending, minimum, unanswered }) : null;

  function onSheetAction() {
    if (!plan?.send) return;
    // Taking the re-offer makes it the bid awaiting confirmation: a retry
    // after a server error resends exactly this.
    if (plan.kind === 'reoffer') setPending(plan.send);
    submitBid(plan.send);
  }

  function closeSheet(open: boolean) {
    if (open) return;
    setPending(null);
  }

  // Step two: the confirmed, binding request.
  async function submitBid(bid: BidDraft) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setError(null);
    setSuccess(null);
    const sig = bidSignature(lotRef, bid);
    const attempt = attemptFor(attemptRef.current, sig, genIdempotencyKey);
    attemptRef.current = attempt;
    // Sending a different bid abandons the unanswered one (the sheet warned).
    setUnanswered((u) => (u && bidSignature(u.lotRef, u.bid) === sig ? u : null));
    setSubmitting(true);
    try {
      const res = await fetch(`/api/lots/${encodeURIComponent(lotRef)}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: bid.amount,
          ...(bid.max !== undefined ? { maxBidAmount: bid.max } : {}),
          idempotencyKey: attempt.key,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status >= 500) {
        // No definitive answer: keep the sheet and the key. The sheet now
        // offers only this same bid again (see planConfirm).
        setUnanswered({ lotRef, bid });
        return;
      }
      // A definitive answer (success or clean 4xx rejection) ends the attempt.
      if (attemptRef.current === attempt) attemptRef.current = null;
      setUnanswered(null);

      if (res.status === 401) {
        setPending(null);
        setError('Please sign in to place a bid.');
        setAuth({ loading: false, loggedIn: false });
        onAuthResolved?.(false);
        return;
      }
      if (res.status === 403 && json?.code === 'VERIFICATION_REQUIRED') {
        // Bidder must clear a higher verification tier before this commitment.
        setPending(null);
        setVerifyPrompt({ tier: json.requiredTier || 'card', reason: json.error || 'Verification required to bid this amount.' });
        return;
      }
      if (!res.ok) {
        // Whatever the reason, the page's view of the lot was stale: take the
        // server's minimum when it sent one (here at once, for every caller)
        // and let the owner re-poll the rest.
        const minRequired = typeof json?.minRequired === 'number' ? json.minRequired : undefined;
        if (minRequired !== undefined) setFloor((f) => raiseFloor(f, lotRef, minRequired));
        onRejected?.({ minRequired });
        if (json?.code === 'BID_TOO_LOW' && minRequired !== undefined) {
          // Stay in the sheet: the raised minimum withdraws Confirm and
          // offers the new amount as its own choice. The line under the form
          // covers a Cancel.
          setError(minimumMovedNotice(minRequired));
          return;
        }
        setPending(null);
        // Engine error codes carry helpful context.
        if (json?.code === 'ALREADY_HIGH_BIDDER') {
          setError('You are already the high bidder.');
        } else if (json?.code === 'AUCTION_CLOSED' || json?.code === 'STATE_MISSING') {
          setError('Bidding has closed for this lot.');
        } else if (res.status === 429) {
          setError('You are bidding too fast. Please wait a moment.');
        } else {
          setError(json?.error || 'Unable to place bid.');
        }
        return;
      }

      // Success (either a placed bid or a max-bid update).
      setPending(null);
      const data = json.data ?? {};
      const nextAmount = data.currentBidAmount ?? bid.amount;
      const nextCount = data.bidCount ?? undefined;
      const highBidder = data.isHighBidder ?? true;
      onBidPlaced({
        currentBidAmount: nextAmount,
        bidCount: typeof nextCount === 'number' ? nextCount : 0,
        isHighBidder: highBidder,
      });
      setCustomAmount('');
      setMaxAmount('');
      setShowMax(false);
      setSuccess(
        data.maxBidUpdated
          ? 'Your maximum bid was updated.'
          : highBidder
            ? "You're the highest bidder."
            : 'Bid placed.',
      );
    } catch {
      // Network drop: the bid may or may not have landed. Resending it
      // replays the same key, so it can never be placed twice.
      setUnanswered({ lotRef, bid });
    } finally {
      sendingRef.current = false;
      setSubmitting(false);
    }
  }

  if (auth.loading) {
    return <div ref={primaryRef} className="h-12 rounded-lg bg-muted/50 animate-pulse" />;
  }

  if (!auth.loggedIn) {
    return (
      <div className="space-y-3">
        <div ref={primaryRef}>
          <Button asChild variant="champagne" size="xl" className="w-full gap-2">
            <Link href={`/login?next=${encodeURIComponent(`/lots/${lotRef}`)}`}>
              <Gavel className="h-5 w-5" /> Sign in to Bid
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Register or sign in to place bids and set a maximum (proxy) bid.
        </p>
      </div>
    );
  }

  const options = quickOptions(currentBidAmount, minimum);
  const parsedCustom = dollarsToCents(customAmount);
  const parsedMax = maxAmount ? dollarsToCents(maxAmount) : undefined;

  return (
    <div className="space-y-4">
      {isHighBidder && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
          <CheckCircle2 className="h-4 w-4" /> You&apos;re the highest bidder.
        </div>
      )}

      {verifyPrompt && (
        <div className="rounded-lg border border-champagne/40 bg-champagne/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-5 w-5 text-champagne shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Verification required</p>
              <p className="text-xs text-muted-foreground mt-0.5">{verifyPrompt.reason}</p>
            </div>
          </div>
          {verifyPrompt.tier === 'identity' ? (
            <>
              <Button variant="champagne" className="w-full gap-2 h-11" disabled={verifying} onClick={() => startVerification('identity')}>
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify my identity
              </Button>
              <p className="text-[11px] text-muted-foreground">
                For high-value lots we confirm your identity with a quick government-ID check, handled securely by Stripe. Takes about a minute.
              </p>
            </>
          ) : (
            <>
              <Button variant="champagne" className="w-full gap-2 h-11" disabled={verifying} onClick={() => startVerification('card')}>
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Add a card to verify
              </Button>
              <p className="text-[11px] text-muted-foreground">
                We authorize your card to confirm you&apos;re a genuine bidder. You are not charged until you win.
              </p>
            </>
          )}
        </div>
      )}

      {/* Quick bids: one tap opens the confirmation, never a bid by itself.
          If the bidder has expanded and typed a proxy max, carry it through
          so a quick-bid tap doesn't silently drop it. */}
      <div ref={primaryRef} className="grid grid-cols-3 gap-2">
        {options.map((opt) => (
          <Button
            key={opt}
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => requestBid(opt, showMax && parsedMax !== undefined ? parsedMax : undefined)}
            className="flex-col h-auto min-h-12 lg:min-h-11 py-2 px-1"
          >
            <span className="text-[13px] sm:text-sm font-semibold tracking-tight tabular-nums">{formatCurrency(opt)}</span>
          </Button>
        ))}
      </div>

      {/* Custom amount (+ optional proxy max). A real form, so Return / Go
          submits — to the confirmation, like the quick bids. */}
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (submitting) return;
          if (!customAmount) {
            setError(`Enter at least ${formatCurrency(minimum)}.`);
            return;
          }
          requestBid(parsedCustom, showMax ? parsedMax : undefined);
        }}
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-base lg:text-sm">$</span>
            <Input
              ref={amountInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="go"
              autoComplete="off"
              aria-label="Your bid in US dollars"
              placeholder={`${Math.ceil(minimum / 100)} or more`}
              value={customAmount}
              onChange={(e) => setCustomAmount(digitsOnly(e.target.value))}
              className="pl-7 h-12 text-base lg:h-9 lg:text-sm tabular-nums"
              disabled={submitting}
            />
          </div>
          <Button
            type="submit"
            variant="champagne"
            disabled={submitting || !customAmount}
            className="gap-2 shrink-0 h-12 lg:h-9"
          >
            <Gavel className="h-4 w-4" />
            Bid
          </Button>
        </div>

        {/* Proxy / max bid */}
        {showMax ? (
          <div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-base lg:text-sm">$</span>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="go"
                autoComplete="off"
                aria-label="Maximum (proxy) bid in US dollars"
                placeholder="Maximum (proxy) bid"
                value={maxAmount}
                onChange={(e) => setMaxAmount(digitsOnly(e.target.value))}
                className="pl-7 h-12 text-base lg:h-9 lg:text-sm tabular-nums"
                disabled={submitting}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              We&apos;ll bid up to this amount for you, one increment at a time.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMax(true)}
            className="flex min-h-11 items-center text-[13px] text-champagne-deep dark:text-champagne hover:underline -my-2"
          >
            + Set a maximum (proxy) bid
          </button>
        )}
      </form>

      <div aria-live="polite">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-600 dark:text-green-500">{success}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>Minimum next bid: {formatCurrency(minimum)}. Bids are binding.</span>
        {paddleNumber && (
          <span className="inline-flex items-center gap-1 shrink-0">
            <ShieldCheck className="h-3 w-3 text-champagne" /> Paddle #{paddleNumber}
          </span>
        )}
      </div>

      <BidConfirmSheet
        open={!!pending}
        onOpenChange={closeSheet}
        lotTitle={lotTitle}
        amount={plan?.shown.amount ?? 0}
        maxAmount={plan?.shown.max}
        buyerPremiumPercent={buyerPremiumPercent}
        submitting={submitting}
        notice={
          plan && (plan.notice || plan.earlierUnconfirmed) ? (
            <>
              {plan.notice}
              {plan.notice && plan.earlierUnconfirmed && ' '}
              {plan.earlierUnconfirmed && (
                <>
                  We couldn&apos;t confirm your earlier bid. Check{' '}
                  <Link href="/my-bids" className="font-medium underline underline-offset-2">My Bids</Link> before
                  bidding again.
                </>
              )}
            </>
          ) : null
        }
        actionLabel={plan?.label ?? null}
        onAction={onSheetAction}
      />
    </div>
  );
}
