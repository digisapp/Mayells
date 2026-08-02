'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LotForm } from '@/components/admin/LotForm';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function NewLotPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(data: Record<string, unknown>) {
    setIsLoading(true);
    try {
      const { images, ...lotData } = data as Record<string, unknown> & {
        images?: { url: string; isPrimary: boolean }[];
      };
      const res = await fetch('/api/lots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lotData),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      // Attach images uploaded before the lot existed. The lot is already
      // created at this point, so a failed attach must not throw (re-submitting
      // would create a duplicate lot); surface it as a warning instead.
      const lotId = result.data?.id;
      if (lotId && images?.length) {
        const hasPrimary = images.some((img) => img.isPrimary);
        let failed = 0;
        for (const [i, img] of images.entries()) {
          const imgRes = await fetch(`/api/lots/${lotId}/images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: img.url,
              isPrimary: img.isPrimary || (!hasPrimary && i === 0),
              sortOrder: i,
            }),
          }).catch(() => null);
          if (!imgRes?.ok) failed++;
        }
        if (failed > 0) {
          toast.warning(`Lot created, but ${failed} image${failed === 1 ? '' : 's'} failed to attach. Edit the lot to re-add.`);
        }
      }
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
