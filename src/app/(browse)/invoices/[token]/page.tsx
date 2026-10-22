export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Clock, AlertCircle, ArrowLeft, Truck, ShieldCheck } from 'lucide-react';
import { db } from '@/db';
import { invoices, lots, auctions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PayButton } from '@/components/invoices/PayButton';
import { PaymentProcessingRefresh } from '@/components/invoices/PaymentProcessingRefresh';
import { buyerInvoiceBadge, invoiceStatusBadge } from '@/components/account/invoice-status';
import { createClient } from '@/lib/supabase/server';
import { formatClockTime, formatLongDate } from '@/lib/format/dates';
import { BUSINESS } from '@/lib/config';
import { isStripeConfigured } from '@/lib/stripe/config';
import { GALLERY_CHECKOUT } from '@/lib/gallery/config';
import { formatAddressLines, parseStoredShippingAddress } from '@/lib/shipping/address';
import { formatCurrencyWithCents } from '@/types';

export const metadata: Metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getInvoice(token: string) {
  const [row] = await db
    .select({
      invoice: invoices,
      lotTitle: lots.title,
      lotSlug: lots.slug,
      lotStatus: lots.status,
      auctionTitle: auctions.title,
    })
    .from(invoices)
    .leftJoin(lots, eq(lots.id, invoices.lotId))
    .leftJoin(auctions, eq(auctions.id, invoices.auctionId))
    .where(eq(invoices.accessToken, token))
    .limit(1);
  return row;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums text-right ${strong ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  );
}

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const { paid } = await searchParams;
  if (!UUID_RE.test(token)) notFound();

  const row = await getInvoice(token);
  if (!row) notFound();

  const { invoice, lotTitle, lotSlug, lotStatus, auctionTitle } = row;
  const gallery = invoice.source === 'gallery';
  // A Buy Now order: the invoice that held the piece while the buyer paid.
  const buyNow = gallery && !!invoice.holdExpiresAt;
  const isPaid = invoice.status === 'paid';
  const isPayable = invoice.status === 'pending' || invoice.status === 'overdue';
  // Back from Stripe but the webhook hasn't marked it paid yet: never offer
  // the pay button again (a second checkout could double-charge).
  const processing = !!paid && !isPaid && isPayable;
  const now = new Date();
  const holdLive = buyNow && isPayable && invoice.holdExpiresAt!.getTime() > now.getTime();
  const holdEnded = buyNow && !isPaid && !processing && !holdLive && invoice.status !== 'refunded';
  const statusBadge = processing ? invoiceStatusBadge(invoice.status) : buyerInvoiceBadge(invoice, now);
  const lotHref = lotSlug ? `/gallery/${lotSlug}` : `/gallery/${invoice.lotId}`;
  const shipTo = formatAddressLines(parseStoredShippingAddress(invoice.shippingAddress));
  const kindLabel = buyNow ? 'Order' : 'Invoice';

  // The token link works signed out (it's emailed); the way back to the
  // invoice list only makes sense for a signed-in buyer.
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    signedIn = !!user;
  } catch {
    // Auth unavailable: the invoice itself still renders.
  }

  const mailto = `mailto:${BUSINESS.email}?subject=${encodeURIComponent(`${kindLabel} ${invoice.invoiceNumber}`)}`;
  const shipping = invoice.shippingCost ?? 0;
  const tax = invoice.taxAmount ?? 0;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-12 sm:py-16">
      {signedIn && (
        <Link
          href="/invoices"
          className="mb-6 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> My invoices
        </Link>
      )}

      {isPaid && gallery ? (
        <div role="status" className="mb-6 rounded-xl border border-green-600/30 bg-green-600/10 p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" aria-hidden />
            <p className="font-display text-xl">Thank you. Your purchase is confirmed.</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            A confirmation is on its way to your inbox. Our team prepares your piece for fully insured shipping and emails
            you the tracking details as soon as it is on its way.
          </p>
        </div>
      ) : isPaid ? (
        <div role="status" className="mb-6 flex items-center gap-3 rounded-lg border border-green-600/30 bg-green-600/10 p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-sm">This invoice has been paid. Thank you!</p>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{buyNow ? 'Gallery order' : gallery ? 'Gallery invoice' : 'Invoice'}</p>
            <CardTitle className="font-display text-2xl">{invoice.invoiceNumber}</CardTitle>
            {(lotTitle || auctionTitle) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {gallery && lotTitle ? (
                  <Link href={lotHref} className="underline-offset-4 hover:underline hover:text-foreground">{lotTitle}</Link>
                ) : (
                  lotTitle
                )}
                {auctionTitle ? ` · ${auctionTitle}` : ''}
              </p>
            )}
          </div>
          <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            {gallery ? (
              <>
                <Row label="Price" value={formatCurrencyWithCents(invoice.hammerPrice)} />
                {invoice.buyerPremium > 0 && (
                  <Row label="Buyer's premium" value={formatCurrencyWithCents(invoice.buyerPremium)} />
                )}
                <Row label="Insured shipping" value={shipping > 0 ? formatCurrencyWithCents(shipping) : 'Complimentary'} />
                {(invoice.insuranceCost ?? 0) > 0 && (
                  <Row label="Insurance" value={formatCurrencyWithCents(invoice.insuranceCost ?? 0)} />
                )}
                {holdLive && tax === 0 ? (
                  <Row label="Sales tax" value="Calculated at checkout" />
                ) : tax > 0 ? (
                  <Row label="Sales tax" value={formatCurrencyWithCents(tax)} />
                ) : null}
                <Separator className="my-2" />
                <Row
                  label={isPaid ? 'Total paid' : holdLive && tax === 0 ? 'Total before tax' : 'Total'}
                  value={formatCurrencyWithCents(invoice.totalAmount)}
                  strong
                />
              </>
            ) : (
              <>
                <Row label="Hammer price" value={formatCurrencyWithCents(invoice.hammerPrice)} />
                <Row label="Buyer's premium" value={formatCurrencyWithCents(invoice.buyerPremium)} />
                {shipping > 0 && <Row label="Shipping" value={formatCurrencyWithCents(shipping)} />}
                {(invoice.insuranceCost ?? 0) > 0 && (
                  <Row label="Insurance" value={formatCurrencyWithCents(invoice.insuranceCost ?? 0)} />
                )}
                {tax > 0 && <Row label="Tax" value={formatCurrencyWithCents(tax)} />}
                <Separator className="my-2" />
                <Row label="Total" value={formatCurrencyWithCents(invoice.totalAmount)} strong />
              </>
            )}
          </div>

          {gallery && isPaid && shipTo.length > 0 && (
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <p className="flex items-center gap-2 font-medium"><Truck className="h-4 w-4" aria-hidden /> Shipping to</p>
              <p className="mt-1 text-muted-foreground">
                {shipTo.map((line, i) => (
                  <span key={i} className="block">{line}</span>
                ))}
              </p>
            </div>
          )}

          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            {isPaid ? (
              <>
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Paid{invoice.paidAt ? ` on ${formatLongDate(invoice.paidAt)}` : ''}</span>
              </>
            ) : holdLive ? (
              <>
                <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Reserved for you until {formatClockTime(invoice.holdExpiresAt!)}.</span>
              </>
            ) : holdEnded ? (
              <>
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  This checkout ended without payment, so the piece is no longer reserved for you and nothing was charged.
                </span>
              </>
            ) : isPayable ? (
              <>
                <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Due by {formatLongDate(invoice.dueDate)}</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>This invoice is {statusBadge.label.toLowerCase()}.</span>
              </>
            )}
          </div>

          {processing ? (
            <>
              <Separator />
              <PaymentProcessingRefresh />
            </>
          ) : holdEnded ? (
            lotStatus === 'for_sale' ? (
              <>
                <Separator />
                <Button asChild variant="champagne" size="lg" className="w-full">
                  <Link href={lotHref}>Return to the piece</Link>
                </Button>
              </>
            ) : null
          ) : isPayable && isStripeConfigured() ? (
            <>
              <Separator />
              <PayButton
                token={token}
                amountLabel={formatCurrencyWithCents(invoice.totalAmount)}
                label={buyNow ? 'Complete purchase' : undefined}
              />
            </>
          ) : isPayable ? (
            // Card payments aren't set up: a Pay button would only fail.
            <>
              <Separator />
              <div className="space-y-1 text-sm">
                <p className="font-medium">Pay by wire transfer</p>
                <p className="text-muted-foreground">
                  Online card payment isn&rsquo;t available right now. Email{' '}
                  <a href={mailto} className="underline underline-offset-4 hover:text-foreground">{BUSINESS.email}</a>
                  {' '}or call{' '}
                  <a href={BUSINESS.phoneHref} className="underline underline-offset-4 hover:text-foreground whitespace-nowrap">{BUSINESS.phone}</a>
                  {' '}and we&rsquo;ll send our wire instructions. Please reference {invoice.invoiceNumber} with your payment.
                </p>
              </div>
            </>
          ) : null}

          {gallery && !holdEnded && (
            <p className="flex items-start gap-2 border-t border-border/40 pt-4 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                Gallery sales are final, with our{' '}
                <Link href="/terms#gallery" className="underline underline-offset-4 hover:text-foreground">as-described guarantee</Link>
                : if the piece arrives damaged, or materially different from its description, tell us within{' '}
                {GALLERY_CHECKOUT.guaranteeDays} days of delivery for a full refund on its return.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Questions about this {buyNow ? 'order' : 'invoice'}?{' '}
        <a href={mailto} className="underline underline-offset-4 hover:text-foreground">Email {BUSINESS.email}</a>
        {' '}or call{' '}
        <a href={BUSINESS.phoneHref} className="underline underline-offset-4 hover:text-foreground whitespace-nowrap">{BUSINESS.phone}</a>
        {' '}and reference {invoice.invoiceNumber}.
      </p>
    </div>
  );
}
