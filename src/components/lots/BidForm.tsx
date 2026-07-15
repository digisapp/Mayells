'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/types';
import { getMinIncrement } from '@/lib/bidding/bid-increments';
import { Gavel, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';

interface BidFormProps {
  lotRef: string; // slug or id
  currentBidAmount: number; // cents (live)
  minNextBid: number; // cents (live)
  isHighBidder: boolean;
  onBidPlaced: (next: { currentBidAmount: number; bidCount: number; isHighBidder: boolean }) => void;
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

export function BidForm({ lotRef, currentBidAmount, minNextBid, isHighBidder, onBidPlaced }: BidFormProps) {
  const [auth, setAuth] = useState<AuthState>({ loading: true, loggedIn: false });
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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!active) return;
        setAuth({ loading: false, loggedIn: meRes.ok });
        if (meRes.ok) {
          const vRes = await fetch('/api/bidder/verification');
          if (active && vRes.ok) {
            const { data } = await vRes.json();
            setPaddleNumber(data?.paddleNumber ?? null);
          }
        }
      } catch {
        if (active) setAuth({ loading: false, loggedIn: false });
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

  async function submitBid(amountCents: number, maxCents?: number) {
    setError(null);
    setSuccess(null);
    if (!Number.isFinite(amountCents) || amountCents < minNextBid) {
      setError(`Enter at least ${formatCurrency(minNextBid)}.`);
      return;
    }
    if (maxCents !== undefined && maxCents < amountCents) {
      setError('Your max bid must be at least your bid amount.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/lots/${encodeURIComponent(lotRef)}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountCents,
          ...(maxCents !== undefined ? { maxBidAmount: maxCents } : {}),
          idempotencyKey: genIdempotencyKey(),
        }),
      });
      const json = await res.json();

      if (res.status === 401) {
        setError('Please sign in to place a bid.');
        setAuth({ loading: false, loggedIn: false });
        return;
      }
      if (res.status === 403 && json?.code === 'VERIFICATION_REQUIRED') {
        // Bidder must clear a higher verification tier before this commitment.
        setVerifyPrompt({ tier: json.requiredTier || 'card', reason: json.error || 'Verification required to bid this amount.' });
        return;
      }
      if (!res.ok) {
        // Engine error codes carry helpful context.
        if (json?.code === 'BID_TOO_LOW' && typeof json.minRequired === 'number') {
          setError(`Too low — the minimum bid is now ${formatCurrency(json.minRequired)}.`);
        } else if (json?.code === 'ALREADY_HIGH_BIDDER') {
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
      const data = json.data ?? {};
      const nextAmount = data.currentBidAmount ?? amountCents;
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
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (auth.loading) {
    return <div className="h-10 rounded-md bg-muted/50 animate-pulse" />;
  }

  if (!auth.loggedIn) {
    return (
      <div className="space-y-3">
        <Link href={`/login?next=${encodeURIComponent(`/lots/${lotRef}`)}`}>
          <Button variant="champagne" size="xl" className="w-full gap-2">
            <Gavel className="h-5 w-5" /> Sign in to Bid
          </Button>
        </Link>
        <p className="text-xs text-muted-foreground text-center">
          Register or sign in to place bids and set a maximum (proxy) bid.
        </p>
      </div>
    );
  }

  const options = quickOptions(currentBidAmount, minNextBid);
  const parsedCustom = customAmount ? Math.round(parseFloat(customAmount) * 100) : NaN;
  const parsedMax = maxAmount ? Math.round(parseFloat(maxAmount) * 100) : undefined;

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
              <Button variant="champagne" className="w-full gap-2" disabled={verifying} onClick={() => startVerification('identity')}>
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify my identity
              </Button>
              <p className="text-[11px] text-muted-foreground">
                For high-value lots we confirm your identity with a quick government-ID check, handled securely by Stripe. Takes about a minute.
              </p>
            </>
          ) : (
            <>
              <Button variant="champagne" className="w-full gap-2" disabled={verifying} onClick={() => startVerification('card')}>
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

      {/* One-tap quick bids. If the bidder has expanded and typed a proxy max,
          carry it through so a quick-bid tap doesn't silently drop it. */}
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => (
          <Button
            key={opt}
            variant="outline"
            disabled={submitting}
            onClick={() => submitBid(opt, showMax && parsedMax !== undefined ? parsedMax : undefined)}
            className="flex-col h-auto py-2"
          >
            <span className="text-sm font-semibold">{formatCurrency(opt)}</span>
          </Button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <Input
            type="number"
            inputMode="decimal"
            min={Math.ceil(minNextBid / 100)}
            step="1"
            placeholder={`${Math.ceil(minNextBid / 100)}+`}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="pl-7"
            disabled={submitting}
          />
        </div>
        <Button
          variant="champagne"
          disabled={submitting || !customAmount}
          onClick={() => submitBid(parsedCustom, showMax ? parsedMax : undefined)}
          className="gap-2 shrink-0"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
          Bid
        </Button>
      </div>

      {/* Proxy / max bid */}
      {showMax ? (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <Input
            type="number"
            inputMode="decimal"
            step="1"
            placeholder="Maximum (proxy) bid"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            className="pl-7"
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground mt-1">
            We&apos;ll bid up to this amount for you, one increment at a time.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowMax(true)}
          className="text-xs text-champagne hover:underline"
        >
          + Set a maximum (proxy) bid
        </button>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      {success && <p className="text-sm text-green-600 dark:text-green-500">{success}</p>}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Minimum next bid: {formatCurrency(minNextBid)}. Bids are binding.</span>
        {paddleNumber && (
          <span className="inline-flex items-center gap-1 shrink-0">
            <ShieldCheck className="h-3 w-3 text-champagne" /> Paddle #{paddleNumber}
          </span>
        )}
      </div>
    </div>
  );
}
