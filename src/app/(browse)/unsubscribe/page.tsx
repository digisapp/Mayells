'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function UnsubscribePage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  async function handleUnsubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setStatus('loading');
    try {
      const res = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-20 md:py-28">
      <h1 className="font-display text-display-md mb-4">Unsubscribe</h1>

      {status === 'success' ? (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-green-900">You&apos;ve been unsubscribed</p>
            <p className="text-sm text-green-700 mt-1">
              You will no longer receive newsletter emails from Mayell. You can re-subscribe at any time from our website.
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-muted-foreground mb-6">
            Enter your email address to unsubscribe from the Mayell newsletter.
          </p>

          {status === 'error' && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 mb-4">
              <XCircle className="h-4 w-4 text-red-600 shrink-0" />
              <p className="text-sm text-red-800">Something went wrong. Please try again.</p>
            </div>
          )}

          <form onSubmit={handleUnsubscribe} className="space-y-4">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button
              type="submit"
              variant="outline"
              disabled={status === 'loading' || !email}
              className="w-full"
            >
              {status === 'loading' ? 'Unsubscribing...' : 'Unsubscribe'}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
