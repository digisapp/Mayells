'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface PayButtonProps {
  token: string;
  amountLabel: string;
}

export function PayButton({ token, amountLabel }: PayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handlePay() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/invoices/${token}/checkout`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || 'Unable to start checkout. Please try again.');
        setLoading(false);
        return;
      }
      // Hand off to Stripe's hosted checkout.
      window.location.assign(data.url);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handlePay} disabled={loading} className="w-full" size="lg">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Redirecting to secure checkout…
          </>
        ) : (
          `Pay ${amountLabel}`
        )}
      </Button>
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      <p className="text-[11px] text-muted-foreground text-center">
        Payments are processed securely by Stripe.
      </p>
    </div>
  );
}
