'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LotForm } from '@/components/admin/LotForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewLotPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(data: Record<string, unknown>) {
    setIsLoading(true);
    try {
      const res = await fetch('/api/lots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      router.push('/admin/lots');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <Link href="/admin/lots" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Lots
      </Link>

      <h1 className="font-display text-display-sm mb-8">Create New Lot</h1>

      <LotForm
        onSubmit={handleSubmit}
        isLoading={isLoading}
        submitLabel="Create Lot"
        cancelHref="/admin/lots"
      />
    </div>
  );
}
