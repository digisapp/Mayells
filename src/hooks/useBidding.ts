'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface BidState {
  currentBid: number;
  bidCount: number;
  closingAt: number | null;
  isExtended: boolean;
}

export function useBidding(auctionId: string, lotId: string, initialState: BidState) {
  const [state, setState] = useState<BidState>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`auction:${auctionId}:lot:${lotId}`)
      .on('broadcast', { event: 'new_bid' }, ({ payload }) => {
        setState((prev) => ({
          ...prev,
          currentBid: payload.amount,
          bidCount: payload.bidCount,
          isExtended: payload.extended ?? false,
          closingAt: payload.newCloseTime ?? prev.closingAt,
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [auctionId, lotId]);

  const placeBid = useCallback(async (amount: number, maxBidAmount?: number) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/lots/${lotId}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          maxBidAmount,
          idempotencyKey: `${lotId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return false;
      }

      return true;
    } catch {
      setError('Failed to place bid. Please try again.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [lotId]);

  return {
    ...state,
    isSubmitting,
    error,
    placeBid,
    clearError: () => setError(null),
  };
}
