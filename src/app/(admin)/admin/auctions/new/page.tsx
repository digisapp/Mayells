'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuctionForm } from '@/components/admin/AuctionForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function NewAuctionPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(data: Record<string, unknown>) {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Toast it and rethrow: AuctionForm shows the message inline next to
        // the fields so the operator can fix (e.g.) a duplicate slug in place.
        const message = result.error || `Could not create the auction (${res.status})`;
        toast.error(message);
        throw new Error(message);
      }
      toast.success('Auction created — add lots next');
      router.push(`/admin/auctions/${result.data.id}?tab=lots`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <Link href="/admin/auctions" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Auctions
      </Link>

      <h1 className="font-display text-display-sm mb-2">Create New Auction</h1>
      <p className="text-sm text-muted-foreground mb-8">
        The sale starts as a draft. Once it is created you will be taken to its lots tab to catalogue approved lots.
      </p>

      <AuctionForm
        onSubmit={handleSubmit}
        isLoading={isLoading}
        submitLabel="Create Auction"
        cancelHref="/admin/auctions"
      />
    </div>
  );
}
