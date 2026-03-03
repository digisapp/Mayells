'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/types';
import { ShoppingBag, Shield, Truck } from 'lucide-react';

interface BuyNowPanelProps {
  lotId: string;
  title: string;
  buyNowPrice: number;
  estimateLow?: number | null;
  estimateHigh?: number | null;
}

export function BuyNowPanel({ lotId, title, buyNowPrice, estimateLow, estimateHigh }: BuyNowPanelProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  async function handlePurchase() {
    if (!isAuthenticated) {
      router.push(`/login?next=/gallery/${lotId}`);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/gallery/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Purchase failed');
        setIsLoading(false);
        return;
      }

      // Redirect to invoice/checkout
      router.push(`/invoices/${data.data.invoiceId}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border/50 rounded-xl p-6 space-y-6 shadow-luxury sticky top-24">
      {/* Price */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Price</p>
        <p className="font-display text-display-md">{formatCurrency(buyNowPrice)}</p>
        {estimateLow && estimateHigh && (
          <p className="text-sm text-muted-foreground mt-1">
            Est. {formatCurrency(estimateLow)} — {formatCurrency(estimateHigh)}
          </p>
        )}
      </div>

      {/* Buy Now / Confirm */}
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
      )}

      {!showConfirm ? (
        <Button
          variant="champagne"
          size="xl"
          className="w-full gap-2"
          onClick={() => {
            if (!isAuthenticated) {
              router.push(`/login?next=/gallery/${lotId}`);
              return;
            }
            setShowConfirm(true);
          }}
        >
          <ShoppingBag className="h-5 w-5" />
          Buy Now
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <p className="font-medium mb-1">Confirm Purchase</p>
            <p className="text-muted-foreground">
              You are purchasing <span className="font-medium text-foreground">{title}</span> for{' '}
              <span className="font-semibold text-foreground">{formatCurrency(buyNowPrice)}</span>.
              A buyer&apos;s premium may apply.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowConfirm(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="champagne"
              className="flex-1"
              onClick={handlePurchase}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : 'Confirm Purchase'}
            </Button>
          </div>
        </div>
      )}

      {/* Trust badges */}
      <div className="border-t border-border/30 pt-4 space-y-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Shield className="h-4 w-4 shrink-0" />
          <span>Authenticity guaranteed</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Truck className="h-4 w-4 shrink-0" />
          <span>Secure worldwide shipping</span>
        </div>
      </div>
    </div>
  );
}
