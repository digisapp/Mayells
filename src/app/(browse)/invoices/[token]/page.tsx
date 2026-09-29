export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Clock, AlertCircle, ArrowLeft } from 'lucide-react';
import { db } from '@/db';
import { invoices, lots, auctions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PayButton } from '@/components/invoices/PayButton';
import { PaymentProcessingRefresh } from '@/components/invoices/PaymentProcessingRefresh';
import { invoiceStatusBadge } from '@/components/account/invoice-status';
import { createClient } from '@/lib/supabase/server';
import { formatLongDate } from '@/lib/format/dates';
import { BUSINESS } from '@/lib/config';
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
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold' : ''}>{value}</span>
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

  const { invoice, lotTitle, auctionTitle } = row;
  const isPaid = invoice.status === 'paid';
  const isPayable = invoice.status === 'pending' || invoice.status === 'overdue';
  // Back from Stripe but the webhook hasn't marked it paid yet: never offer
  // the pay button again (a second checkout could double-charge).
  const processing = !!paid && !isPaid && isPayable;
  const statusBadge = invoiceStatusBadge(invoice.status);

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

  const mailto = `mailto:${BUSINESS.email}?subject=${encodeURIComponent(`Invoice ${invoice.invoiceNumber}`)}`;

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

      {isPaid && (
        <div role="status" className="mb-6 flex items-center gap-3 rounded-lg border border-green-600/30 bg-green-600/10 p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-sm">This invoice has been paid. Thank you!</p>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Invoice</p>
            <CardTitle className="font-display text-2xl">{invoice.invoiceNumber}</CardTitle>
            {(lotTitle || auctionTitle) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {lotTitle}
                {auctionTitle ? ` · ${auctionTitle}` : ''}
              </p>
            )}
          </div>
          <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <Row label="Hammer price" value={formatCurrencyWithCents(invoice.hammerPrice)} />
            <Row label="Buyer's premium" value={formatCurrencyWithCents(invoice.buyerPremium)} />
            {(invoice.shippingCost ?? 0) > 0 && (
              <Row label="Shipping" value={formatCurrencyWithCents(invoice.shippingCost ?? 0)} />
            )}
            {(invoice.insuranceCost ?? 0) > 0 && (
              <Row label="Insurance" value={formatCurrencyWithCents(invoice.insuranceCost ?? 0)} />
            )}
            {(invoice.taxAmount ?? 0) > 0 && (
              <Row label="Tax" value={formatCurrencyWithCents(invoice.taxAmount ?? 0)} />
            )}
            <Separator className="my-2" />
            <Row label="Total" value={formatCurrencyWithCents(invoice.totalAmount)} strong />
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isPaid ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Paid{invoice.paidAt ? ` on ${formatLongDate(invoice.paidAt)}` : ''}</span>
              </>
            ) : isPayable ? (
              <>
                <Clock className="h-4 w-4" />
                <span>Due by {formatLongDate(invoice.dueDate)}</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4" />
                <span>This invoice is {statusBadge.label.toLowerCase()}.</span>
              </>
            )}
          </div>

          {processing ? (
            <>
              <Separator />
              <PaymentProcessingRefresh />
            </>
          ) : isPayable ? (
            <>
              <Separator />
              <PayButton token={token} amountLabel={formatCurrencyWithCents(invoice.totalAmount)} />
            </>
          ) : null}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Questions about this invoice?{' '}
        <a href={mailto} className="underline underline-offset-4 hover:text-foreground">Email {BUSINESS.email}</a>
        {' '}or call{' '}
        <a href={BUSINESS.phoneHref} className="underline underline-offset-4 hover:text-foreground whitespace-nowrap">{BUSINESS.phone}</a>
        {' '}and reference {invoice.invoiceNumber}.
      </p>
    </div>
  );
}
