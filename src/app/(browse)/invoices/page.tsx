export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { invoices, lots } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { formatCurrencyWithCents } from '@/types';

export const metadata: Metadata = {
  title: 'My Invoices | Mayells',
  robots: { index: false, follow: false },
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-green-600 text-white' },
  pending: { label: 'Payment Due', className: 'bg-amber-500 text-white' },
  overdue: { label: 'Overdue', className: 'bg-red-600 text-white' },
  refunded: { label: 'Refunded', className: 'bg-zinc-500 text-white' },
  cancelled: { label: 'Cancelled', className: 'bg-zinc-500 text-white' },
};

export default async function MyInvoicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/invoices');
  }

  const rows = await db
    .select({
      invoice: invoices,
      lotTitle: lots.title,
    })
    .from(invoices)
    .leftJoin(lots, eq(lots.id, invoices.lotId))
    .where(eq(invoices.buyerId, user.id))
    .orderBy(desc(invoices.createdAt));

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 sm:py-16">
      <h1 className="font-display text-3xl mb-6">My Invoices</h1>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">You don&apos;t have any invoices yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ invoice, lotTitle }) => {
            const badge = STATUS_BADGE[invoice.status] ?? { label: invoice.status, className: '' };
            return (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.accessToken}`}
                className="flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{lotTitle || invoice.invoiceNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {invoice.invoiceNumber} · Due {invoice.dueDate.toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-semibold tabular-nums">
                    {formatCurrencyWithCents(invoice.totalAmount)}
                  </span>
                  <Badge className={badge.className}>{badge.label}</Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
