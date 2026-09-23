'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LotForm } from '@/components/admin/LotForm';
import { PageHeader } from '@/components/admin/PageHeader';
import { toast } from 'sonner';

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
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Failed to create lot');

      // The lot exists from here on, so nothing below may throw — a re-submit
      // would create a duplicate. Follow-up failures are surfaced as warnings.
      const lotId = result.data?.id as string | undefined;

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
      toast.success('Lot created');
      router.push(lotId ? `/admin/lots/${lotId}` : '/admin/lots');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="New lot" />

      <LotForm
        onSubmit={handleSubmit}
        isLoading={isLoading}
        submitLabel="Create lot"
        cancelHref="/admin/lots"
      />
    </div>
  );
}
