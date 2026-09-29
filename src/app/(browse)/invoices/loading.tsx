import { Receipt } from 'lucide-react';
import { AccountShell } from '@/components/account/AccountShell';
import { Skeleton } from '@/components/ui/skeleton';

export default function InvoicesLoading() {
  return (
    <AccountShell active="invoices" title="My Invoices" icon={<Receipt className="h-6 w-6 text-champagne" />}>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-lg" />
        ))}
      </div>
    </AccountShell>
  );
}
