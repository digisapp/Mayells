export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { invoices, lots } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AccountShell } from '@/components/account/AccountShell';
import { invoiceStatusBadge } from '@/components/account/invoice-status';
import { formatShortDate } from '@/lib/format/dates';
import { formatCurrencyWithCents } from '@/types';

export const metadata: Metadata = {
  title: 'My Invoices',
  robots: { index: false, follow: false },
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
    <AccountShell active="invoices" title="My Invoices" icon={<Receipt className="h-6 w-6 text-champagne" />}>
      {rows.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground mb-5">
            You don&apos;t have any invoices yet. Lots you win will appear here.
          </p>
          <Button asChild size="lg" variant="champagne">
            <Link href="/auctions">Browse auctions</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ invoice, lotTitle }) => {
            const badge = invoiceStatusBadge(invoice.status);
            return (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.accessToken}`}
                className="flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{lotTitle || invoice.invoiceNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {invoice.invoiceNumber} · Due {formatShortDate(invoice.dueDate)}
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
    </AccountShell>
  );
}
