import { Gavel } from 'lucide-react';
import { AccountShell } from '@/components/account/AccountShell';
import { AccountListSkeleton } from '@/components/account/AccountListSkeleton';

export default function MyBidsLoading() {
  return (
    <AccountShell active="my-bids" title="My Bids" icon={<Gavel className="h-6 w-6 text-champagne" />}>
      <AccountListSkeleton />
    </AccountShell>
  );
}
