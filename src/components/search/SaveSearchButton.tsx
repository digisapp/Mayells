'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { BellPlus, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SaveSearchButtonProps {
  query: string;
  categoryId?: string;
}

export function SaveSearchButton({ query, categoryId }: SaveSearchButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const trimmed = query.trim();
  if (!trimmed && !categoryId) return null;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, categoryId: categoryId || null }),
      });
      if (res.status === 401) {
        const next = `/search?q=${encodeURIComponent(trimmed)}`;
        router.push(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'request failed');
      setSaved(true);
      toast.success(
        body?.data?.alreadySaved
          ? 'You already follow this search'
          : "Search saved — we'll email you when matching items arrive",
      );
    } catch (err) {
      toast.error(err instanceof Error && err.message !== 'request failed' ? err.message : 'Could not save this search. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={save}
      disabled={busy || saved}
      className="gap-1.5"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : saved ? (
        <Check className="h-3.5 w-3.5 text-champagne" />
      ) : (
        <BellPlus className="h-3.5 w-3.5" />
      )}
      {saved ? 'Following' : 'Follow this search'}
    </Button>
  );
}
