'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, CircleAlert, CircleSlash, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { formatCurrencyWithCents } from '@/types';
import { formatClockTime, formatShortDate } from '@/lib/format/dates';

export interface GalleryReservationSummary {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  holdExpiresAt: string | null;
  dueDate: string;
  buyerName: string | null;
  buyerEmail: string;
}

export interface CheckoutReadinessSummary {
  stripe: boolean;
  webhook: boolean;
  tax: 'active' | 'pending' | 'off' | 'unknown';
}

interface GallerySaleCardProps {
  lotId: string;
  saleType: 'gallery' | 'private';
  status: string;
  buyNowPrice: number | null;
  shippingPrice: number | null;
  onlineCheckout: boolean;
  reservation: GalleryReservationSummary | null;
  checkout: CheckoutReadinessSummary | null;
  onChanged: () => Promise<void> | void;
}

const dollars = (cents: number | null | undefined) => (cents == null ? '' : String(cents / 100));

function toCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/**
 * The gallery side of the admin lot page: is Buy Now live (and if not, why),
 * who has the piece reserved, and "Invoice a client" for a sale agreed with a
 * specialist. Mirrors lib/gallery/purchase-state.ts and readiness.ts.
 */
export function GallerySaleCard(props: GallerySaleCardProps) {
  const { lotId, saleType, status, buyNowPrice, shippingPrice, onlineCheckout, reservation, checkout, onChanged } = props;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', fullName: '', price: '', shipping: '', tax: '', dueDays: '7', note: '' });

  function openDialog() {
    setForm({
      email: '',
      fullName: '',
      price: dollars(buyNowPrice),
      shipping: dollars(shippingPrice),
      tax: '',
      dueDays: '7',
      note: '',
    });
    setOpen(true);
  }

  // Why Buy Now isn't taking payments, worst first.
  const problems: string[] = [];
  if (onlineCheckout && saleType === 'gallery') {
    if (status !== 'for_sale') problems.push('The piece isn’t listed for sale.');
    if (checkout && !checkout.stripe) problems.push('Stripe isn’t connected (no STRIPE_SECRET_KEY), so the page offers an inquiry instead.');
    if (checkout?.stripe && !checkout.webhook) {
      problems.push('STRIPE_WEBHOOK_SECRET is missing: payments would be taken but never recorded. Do not sell until it is set.');
    }
    if (checkout?.tax === 'pending') problems.push('Stripe Tax isn’t activated (origin address and registrations), so Stripe will refuse checkout.');
    if (checkout?.tax === 'unknown' && checkout.stripe) problems.push('Couldn’t confirm Stripe Tax is active.');
  }
  const live = onlineCheckout && saleType === 'gallery' && problems.length === 0;

  const total = (() => {
    const parts = [toCents(form.price), toCents(form.shipping), toCents(form.tax)];
    return parts.every((p) => p !== null) ? (parts as number[]).reduce((a, b) => a + b, 0) : null;
  })();

  async function submitInvoice() {
    const price = toCents(form.price);
    const shippingCost = toCents(form.shipping);
    const taxAmount = toCents(form.tax);
    const dueDays = Number(form.dueDays);
    if (!form.email.trim()) {
      toast.error('Enter the client’s email address');
      throw new Error('missing email');
    }
    if (!price || shippingCost === null || taxAmount === null) {
      toast.error('Enter a price, and shipping and tax as 0 or more');
      throw new Error('bad amounts');
    }
    if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 60) {
      toast.error('Payment terms must be 1 to 60 days');
      throw new Error('bad due days');
    }
    const res = await fetch(`/api/admin/lots/${lotId}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        fullName: form.fullName || undefined,
        price,
        shippingCost,
        taxAmount,
        dueDays,
        note: form.note || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || 'Could not create the invoice');
      throw new Error(body.error || 'failed');
    }
    toast.success(
      body.emailed
        ? `Invoice ${body.data.invoiceNumber} emailed to ${form.email}`
        : `Invoice ${body.data.invoiceNumber} created — the email didn’t send yet; it will retry automatically`,
    );
    await onChanged();
  }

  const holdActive = !!reservation?.holdExpiresAt;

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle className="text-sm">Gallery sale</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {saleType === 'gallery' && (
          <div className="flex items-start gap-2.5">
            {live ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-700" aria-hidden />
            ) : onlineCheckout ? (
              <CircleAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" aria-hidden />
            ) : (
              <CircleSlash className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <div className="space-y-1">
              <p className="font-medium">
                {live
                  ? 'Buy Now is live: buyers can pay online'
                  : onlineCheckout
                    ? 'Online checkout is switched on, but not live yet'
                    : 'Online checkout is off: buyers are asked to contact a specialist'}
              </p>
              {problems.map((p) => (
                <p key={p} className="text-amber-800">{p}</p>
              ))}
              {live && (
                <p className="text-muted-foreground">
                  {shippingPrice ? `${formatCurrencyWithCents(shippingPrice)} insured US shipping` : 'Complimentary insured US shipping'}
                  {checkout?.tax === 'off' ? ' · sales tax is not being collected (STRIPE_TAX=off)' : ' · sales tax by Stripe Tax'}
                </p>
              )}
            </div>
          </div>
        )}

        {reservation ? (
          <div className="flex items-start gap-2.5 rounded-md border border-amber-600/30 bg-amber-50/60 dark:bg-amber-950/20 p-3">
            <Clock className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" aria-hidden />
            <div className="space-y-0.5">
              <p className="font-medium">
                {holdActive ? 'Reserved: a buyer is checking out online' : 'Reserved: invoiced to a client'}
              </p>
              <p className="text-muted-foreground">
                {reservation.buyerName || reservation.buyerEmail}
                {reservation.buyerName ? ` (${reservation.buyerEmail})` : ''} ·{' '}
                <Link href={`/admin/invoices?q=${encodeURIComponent(reservation.invoiceNumber)}`} className="underline underline-offset-2 hover:text-foreground">
                  {reservation.invoiceNumber}
                </Link>{' '}
                · {formatCurrencyWithCents(reservation.totalAmount)}
                {holdActive ? ' before tax' : ''}
              </p>
              <p className="text-muted-foreground">
                {holdActive
                  ? `Held until ${formatClockTime(reservation.holdExpiresAt!)}. If it isn’t paid by then the piece goes back on sale by itself.`
                  : `${reservation.status === 'overdue' ? 'Overdue — was due' : 'Due'} ${formatShortDate(reservation.dueDate)}. Cancel the invoice in Invoices to put the piece back on sale.`}
              </p>
            </div>
          </div>
        ) : status === 'for_sale' ? (
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Agreed a sale by phone or email, or a client prefers to pay by wire? Invoice them: the piece shows as reserved until they pay.
            </p>
            <Button size="sm" variant="outline" onClick={openDialog}>Invoice a client</Button>
          </div>
        ) : null}

        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Invoice a client for this piece"
          confirmLabel="Create & email invoice"
          onConfirm={submitInvoice}
          description={
            <div className="space-y-3 text-sm text-foreground">
              <p className="text-muted-foreground">
                The client gets an emailed invoice to pay by card or wire. No buyer&rsquo;s premium is added. A client without an account doesn&rsquo;t need one.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="gi-email">Client email *</Label>
                  <Input id="gi-email" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="gi-name">Client name</Label>
                  <Input id="gi-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gi-price">Price (USD) *</Label>
                  <Input id="gi-price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gi-shipping">Shipping (USD)</Label>
                  <Input id="gi-shipping" type="number" min="0" step="0.01" value={form.shipping} placeholder="0" onChange={(e) => setForm({ ...form, shipping: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gi-tax">Sales tax (USD)</Label>
                  <Input id="gi-tax" type="number" min="0" step="0.01" value={form.tax} placeholder="0" onChange={(e) => setForm({ ...form, tax: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gi-due">Due in (days)</Label>
                  <Input id="gi-due" type="number" min="1" max="60" step="1" value={form.dueDays} onChange={(e) => setForm({ ...form, dueDays: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="gi-note">Internal note</Label>
                  <Input id="gi-note" value={form.note} placeholder="e.g. agreed by phone, collecting in person" onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>
              </div>
              <p className="text-muted-foreground">
                Work out the sales tax yourself for these: Florida delivery or collection is taxable; a resale certificate on file makes it exempt.
              </p>
              <p className="font-medium">Total: {total === null ? '—' : formatCurrencyWithCents(total)}</p>
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}
