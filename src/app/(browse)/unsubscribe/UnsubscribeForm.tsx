'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BUSINESS } from '@/lib/config';
import { CheckCircle2, XCircle } from 'lucide-react';

export function UnsubscribeForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const uid = useId();
  const [email, setEmail] = useState(defaultEmail);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleUnsubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setStatus('success');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(
        res.status === 429
          ? `Too many attempts from this connection. Please try again in an hour, or email ${BUSINESS.email} and we will remove you.`
          : res.status === 400
            ? data.error || 'Please enter a valid email address.'
            : `We couldn’t unsubscribe you just now. Please try again, or email ${BUSINESS.email} and we will remove you.`,
      );
      setStatus('error');
    } catch {
      setError('Couldn’t connect. Check your connection and try again.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div role="status" className="space-y-6">
        <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium text-green-900">You&apos;ve been unsubscribed</p>
            <p className="text-sm text-green-800 mt-1">
              You will no longer receive newsletter emails from Mayells. You can re-subscribe at any time from our website.
            </p>
          </div>
        </div>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href="/">Return to Mayells</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <p className="text-muted-foreground mb-6">
        Enter your email address to unsubscribe from the Mayells newsletter.
      </p>

      {status === 'error' && error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 mb-4">
          <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" aria-hidden />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={handleUnsubscribe} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${uid}-email`}>Email address</Label>
          <Input
            id={`${uid}-email`}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 text-base md:text-base"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          variant="outline"
          disabled={status === 'loading'}
          className="w-full"
        >
          {status === 'loading' ? 'Unsubscribing…' : 'Unsubscribe'}
        </Button>
      </form>
    </>
  );
}
