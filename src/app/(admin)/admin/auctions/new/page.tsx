'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuctionForm } from '@/components/admin/AuctionForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

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
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      router.push('/admin/auctions');
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

      <h1 className="font-display text-display-sm mb-8">Create New Auction</h1>

      <AuctionForm
        onSubmit={handleSubmit}
        isLoading={isLoading}
        submitLabel="Create Auction"
        cancelHref="/admin/auctions"
      />
    </div>
  );
}
