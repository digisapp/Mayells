'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Heart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface WatchButtonProps {
  lotId: string;
  initialWatching: boolean;
  loggedIn: boolean;
  lotRef: string; // slug or id, for the sign-in redirect
  className?: string;
}

export function WatchButton({ lotId, initialWatching, loggedIn, lotRef, className }: WatchButtonProps) {
  const router = useRouter();
  const [watching, setWatching] = useState(initialWatching);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/lots/${lotRef}`)}`);
      return;
    }
    const next = !watching;
    setWatching(next); // optimistic
    setBusy(true);
    try {
      const res = next
        ? await fetch('/api/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lotId }),
          })
        : await fetch(`/api/watchlist?lotId=${encodeURIComponent(lotId)}`, { method: 'DELETE' });

      if (!res.ok) throw new Error('request failed');
      toast.success(next ? 'Added to your watchlist' : 'Removed from your watchlist');
    } catch {
      setWatching(!next); // revert
      toast.error('Could not update your watchlist. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant={watching ? 'secondary' : 'outline'}
      onClick={toggle}
      disabled={busy}
      aria-pressed={watching}
      aria-label={watching ? 'Remove from watchlist' : 'Add to watchlist'}
      className={`gap-2 ${className ?? ''}`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Heart className={`h-4 w-4 ${watching ? 'fill-current text-red-500' : ''}`} />
      )}
      {watching ? 'Watching' : 'Watch'}
    </Button>
  );
}
