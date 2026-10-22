'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { track } from '@vercel/analytics';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/types';
import { ShoppingBag, FileText, Truck, Phone, Mail, ShieldCheck, Lock, Receipt, Clock, Loader2 } from 'lucide-react';
import { formatEstimate } from '@/lib/format/estimate';
import { formatClockTime } from '@/lib/format/dates';
import { BUSINESS } from '@/lib/config';
import { MobileActionBar, scrollIntoViewBelowNav } from '@/components/lots/MobileActionBar';
import { useHideChatLauncher } from '@/components/chat/use-hide-chat-launcher';

/** lib/gallery/purchase-state.ts GalleryPurchaseState, serialised for the client (sold/unavailable never reach the panel). */
export type BuyNowPanelState =
  | { kind: 'buy' }
  | { kind: 'held_for_you'; until: string }
  | { kind: 'on_hold'; until: string }
  | { kind: 'invoiced_to_you'; accessToken: string }
  | { kind: 'reserved' }
  | { kind: 'inquire' };

interface BuyNowPanelProps {
  lotId: string;
  /** The piece's own page, for the sign-in round trip. */
  lotPath: string;
  title: string;
  /** null: a private sale offered without a published price — the panel asks for one instead. */
  buyNowPrice: number | null;
  estimateLow?: number | null;
  estimateHigh?: number | null;
  /** Insured US shipping charged at checkout (0 = complimentary). */
  shippingPrice: number | null;
  state: BuyNowPanelState;
  signedIn: boolean;
  /** Stripe Tax adds sales tax at checkout. */
  salesTax: boolean;
  guaranteeDays: number;
  /** ?buy=1 (back from signing in to buy) or ?checkout=cancelled (back from Stripe). */
  intent: 'buy' | 'cancelled' | null;
}

const NOTE = 'flex items-start gap-3 text-sm text-muted-foreground';
const NOTE_ICON = 'h-4 w-4 shrink-0 mt-0.5';

export function BuyNowPanel(props: BuyNowPanelProps) {
  const { lotId, lotPath, title, buyNowPrice, estimateLow, estimateHigh, shippingPrice, state, signedIn, salesTax, guaranteeDays, intent } = props;
  const router = useRouter();
  const [showContact, setShowContact] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; invoiceToken?: string } | null>(null);
  const [notice, setNotice] = useState('');
  // The panel's own call to action: the phone bar shows while it is off screen.
  const [ctaEl, setCtaEl] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buyButtonRef = useRef<HTMLButtonElement>(null);
  // On a phone the chat bubble sits on the full-width button.
  useHideChatLauncher(panelRef);

  const canCheckout = state.kind === 'buy' || state.kind === 'held_for_you';
  const until = state.kind === 'held_for_you' || state.kind === 'on_hold' ? new Date(state.until) : null;
  const untilMs = until?.getTime() ?? null;

  // Follows the word "Estimate", so "up to $2,000" is lower-cased.
  const estimateText = formatEstimate(estimateLow, estimateHigh)?.replace(/^Up to/, 'up to') ?? null;
  const priceLabel = buyNowPrice ? 'Price' : 'Private sale';
  const priceText = buyNowPrice ? formatCurrency(buyNowPrice) : 'Price on request';
  const mailSubject = `${buyNowPrice ? 'Purchase Inquiry' : 'Price Inquiry'}: ${title}`;
  const loginHref = `/login?next=${encodeURIComponent(`${lotPath}?buy=1`)}`;

  // A hold changes hands when it lapses: re-render then, so "on hold" turns
  // back into Buy Now (and "reserved for you" stops promising a reservation).
  useEffect(() => {
    if (untilMs === null) return;
    const ms = untilMs - Date.now() + 3000;
    if (ms > 2_147_000_000) return;
    const t = setTimeout(() => router.refresh(), Math.max(1000, ms));
    return () => clearTimeout(t);
  }, [untilMs, router]);

  // Back from signing in to buy: bring the button into view and focus it.
  useEffect(() => {
    if (intent !== 'buy' || !canCheckout || !signedIn) return;
    if (panelRef.current) scrollIntoViewBelowNav(panelRef.current);
    buyButtonRef.current?.focus({ preventScroll: true });
  }, [intent, canCheckout, signedIn]);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    setNotice('');
    track('gallery_buy_now', { lotId, resumed: state.kind === 'held_for_you' });
    try {
      const res = await fetch(`/api/gallery/${lotId}/checkout`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        // Stay "loading" while the browser leaves for Stripe.
        window.location.assign(data.url);
        return;
      }
      if (res.status === 401) {
        router.push(loginHref);
        return;
      }
      if (data.code === 'PROCESSING') {
        setNotice(data.error);
      } else {
        setError({ message: data.error || 'Unable to start checkout. Please try again.', invoiceToken: data.invoiceToken });
      }
      // Someone else's hold or a sale changes what this panel should offer.
      if (['ON_HOLD', 'RESERVED', 'SOLD', 'NOT_AVAILABLE', 'INVOICED'].includes(data.code)) router.refresh();
    } catch {
      setError({ message: 'Something went wrong. Please check your connection and try again.' });
    }
    setLoading(false);
  }

  const openContact = () => {
    setShowContact(true);
    if (panelRef.current) scrollIntoViewBelowNav(panelRef.current);
  };

  const shippingLine =
    shippingPrice == null
      ? 'Worldwide shipping through fine-art shippers'
      : shippingPrice > 0
        ? `Insured shipping to US addresses: ${formatCurrency(shippingPrice)}`
        : 'Complimentary insured shipping within the US';

  const contactBlock = (
    <div className="bg-muted/50 rounded-lg px-4 py-3 text-sm">
      <p className="font-medium">Speak with a specialist</p>
      <p className="text-muted-foreground mt-0.5 mb-1">
        {canCheckout
          ? 'For international delivery, collection in person, payment by wire, or any question about this piece.'
          : 'We’ll confirm availability and arrange payment and delivery.'}
      </p>
      <a
        href={`mailto:${BUSINESS.email}?subject=${encodeURIComponent(mailSubject)}`}
        className="flex min-h-11 items-center gap-2.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Mail className="h-4 w-4" />
        {BUSINESS.email}
      </a>
      <a
        href={BUSINESS.phoneHref}
        className="flex min-h-11 items-center gap-2.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Phone className="h-4 w-4" />
        {BUSINESS.phone}
      </a>
    </div>
  );

  const buyButton = (opts: { className?: string; compact?: boolean } = {}) => {
    const label = state.kind === 'held_for_you' ? 'Complete purchase' : 'Buy Now';
    const content = loading ? (
      <>
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        {opts.compact ? 'Opening…' : 'Opening secure checkout…'}
      </>
    ) : (
      <>
        <ShoppingBag className={opts.compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />
        {label}
      </>
    );
    if (!signedIn) {
      return (
        <Button asChild variant="champagne" size={opts.compact ? undefined : 'xl'} className={opts.className}>
          <Link href={loginHref} onClick={() => track('gallery_buy_now', { lotId, signedIn: false })}>{content}</Link>
        </Button>
      );
    }
    return (
      <Button
        ref={opts.compact ? undefined : buyButtonRef}
        type="button"
        variant="champagne"
        size={opts.compact ? undefined : 'xl'}
        className={opts.className}
        onClick={startCheckout}
        disabled={loading || !!notice}
      >
        {content}
      </Button>
    );
  };

  let cta: React.ReactNode;
  if (canCheckout) {
    cta = (
      <div className="space-y-3">
        {state.kind === 'held_for_you' && until && (
          <div role="status" className="flex items-start gap-2.5 rounded-lg border border-champagne/50 bg-champagne/10 px-3.5 py-3 text-sm">
            <Clock className="h-4 w-4 mt-0.5 shrink-0 text-champagne-deep" aria-hidden />
            <p>
              {intent === 'cancelled' ? 'Checkout was closed before payment. ' : ''}
              This piece is reserved for you until <strong className="whitespace-nowrap">{formatClockTime(until)}</strong>.
            </p>
          </div>
        )}
        {intent === 'buy' && signedIn && state.kind === 'buy' && (
          <p role="status" className="text-sm">You&rsquo;re signed in. Continue to secure checkout.</p>
        )}
        {buyButton({ className: 'w-full gap-2' })}
        <p className="text-sm text-muted-foreground">
          {!signedIn
            ? 'You’ll sign in or create an account first. '
            : ''}
          {state.kind === 'held_for_you'
            ? 'You’ll return to the same secure checkout.'
            : 'The piece is held for you while you pay on a secure Stripe checkout.'}
        </p>
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error.message}
            {error.invoiceToken && (
              <>
                {' '}
                <Link href={`/invoices/${error.invoiceToken}`} className="font-medium underline underline-offset-4">View your invoice</Link>
              </>
            )}
          </p>
        )}
        {showContact ? (
          contactBlock
        ) : (
          <button
            type="button"
            onClick={() => setShowContact(true)}
            className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 decoration-champagne/60 hover:decoration-champagne-deep"
          >
            Ask a specialist
          </button>
        )}
      </div>
    );
  } else if (state.kind === 'on_hold' && until) {
    cta = (
      <div className="space-y-3">
        <div role="status" className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
          <p className="font-medium flex items-center gap-2"><Clock className="h-4 w-4 text-champagne-deep" aria-hidden /> On hold</p>
          <p className="text-muted-foreground mt-1">
            Another collector is completing their purchase. If it isn&rsquo;t completed, this piece is available again at{' '}
            <span className="whitespace-nowrap">{formatClockTime(until)}</span>.
          </p>
        </div>
        {showContact ? contactBlock : (
          <Button variant="outline" size="lg" className="w-full" onClick={() => setShowContact(true)}>Ask a specialist</Button>
        )}
      </div>
    );
  } else if (state.kind === 'invoiced_to_you') {
    cta = (
      <div className="space-y-3">
        <p role="status" className="text-sm">This piece is reserved for you. Your invoice is ready to pay.</p>
        <Button asChild variant="champagne" size="xl" className="w-full gap-2">
          <Link href={`/invoices/${state.accessToken}`}><Receipt className="h-5 w-5" aria-hidden /> View &amp; pay invoice</Link>
        </Button>
      </div>
    );
  } else if (state.kind === 'reserved') {
    cta = (
      <div className="space-y-3">
        <div role="status" className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
          <p className="font-medium">Reserved</p>
          <p className="text-muted-foreground mt-1">This piece is reserved for another client. Ask a specialist to hear if it becomes available.</p>
        </div>
        {showContact ? contactBlock : (
          <Button variant="outline" size="lg" className="w-full" onClick={() => setShowContact(true)}>Ask a specialist</Button>
        )}
      </div>
    );
  } else {
    cta = !showContact ? (
      <>
        <Button variant="champagne" size="xl" className="w-full gap-2" onClick={() => setShowContact(true)}>
          <ShoppingBag className="h-5 w-5" aria-hidden />
          {buyNowPrice ? 'Inquire to Purchase' : 'Inquire for Price'}
        </Button>
        <p className="mt-3 text-sm text-muted-foreground">
          A Mayells specialist confirms availability and arranges payment and delivery with you.
        </p>
      </>
    ) : (
      contactBlock
    );
  }

  return (
    <div ref={panelRef} className="bg-card border border-border/50 rounded-xl p-6 space-y-6 shadow-luxury lg:sticky lg:top-24">
      {/* Price */}
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{priceLabel}</p>
        <p className="font-display text-display-md tabular-nums">{priceText}</p>
        {estimateText && (
          <p className="text-sm text-muted-foreground mt-1">Estimate {estimateText}</p>
        )}
      </div>

      <div ref={setCtaEl}>{cta}</div>

      {/* Service notes — only what the house actually offers (Terms 2.15–2.16). */}
      <ul className="border-t border-border/30 pt-4 space-y-3">
        <li className={NOTE}>
          <Truck className={NOTE_ICON} aria-hidden />
          <span>
            {shippingLine}
            {canCheckout && <span className="block text-xs mt-0.5">International delivery through a specialist.</span>}
          </span>
        </li>
        {canCheckout && salesTax && (
          <li className={NOTE}>
            <Receipt className={NOTE_ICON} aria-hidden />
            <span>Any sales tax is calculated at checkout from the delivery address.</span>
          </li>
        )}
        {(canCheckout || state.kind === 'on_hold') && (
          <li className={NOTE}>
            <ShieldCheck className={NOTE_ICON} aria-hidden />
            <span>
              Final sale, with our {guaranteeDays}-day{' '}
              <Link href="/terms#gallery" className="underline underline-offset-4 hover:text-foreground">as-described guarantee</Link>
            </span>
          </li>
        )}
        {canCheckout && (
          <li className={NOTE}>
            <Lock className={NOTE_ICON} aria-hidden />
            <span>Secure card payment through Stripe</span>
          </li>
        )}
        <li className={NOTE}>
          <FileText className={NOTE_ICON} aria-hidden />
          <span>Condition report on request</span>
        </li>
      </ul>

      <MobileActionBar target={ctaEl} enabled label="Purchase this piece">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {state.kind === 'on_hold' ? 'On hold' : state.kind === 'reserved' ? 'Reserved' : priceLabel}
          </p>
          <p className="font-display text-xl leading-tight tabular-nums truncate">{priceText}</p>
        </div>
        {canCheckout ? (
          buyButton({ className: 'h-12 shrink-0 gap-2 rounded-lg px-5 text-[15px]', compact: true })
        ) : state.kind === 'invoiced_to_you' ? (
          <Button asChild variant="champagne" className="h-12 shrink-0 gap-2 rounded-lg px-5 text-[15px]">
            <Link href={`/invoices/${state.accessToken}`}>Pay invoice</Link>
          </Button>
        ) : (
          <Button type="button" variant={state.kind === 'inquire' ? 'champagne' : 'outline'} className="h-12 shrink-0 gap-2 rounded-lg px-5 text-[15px]" onClick={openContact}>
            {state.kind === 'inquire' ? (
              <>
                <ShoppingBag className="h-4 w-4" aria-hidden />
                {buyNowPrice ? 'Inquire to Purchase' : 'Inquire for Price'}
              </>
            ) : 'Ask a specialist'}
          </Button>
        )}
      </MobileActionBar>
    </div>
  );
}
