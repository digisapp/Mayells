'use client';

import { useState } from 'react';
import { toast } from 'sonner';

export function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setDone(true);
        toast.success('Subscribed!');
      } else {
        toast.error('Failed to subscribe');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <p className="text-xs text-champagne">You&apos;re subscribed. We&apos;ll keep you posted.</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-1.5">
      <input
        type="email"
        required
        placeholder="Email for updates"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 min-w-0 bg-background border border-border/60 rounded-md px-3 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:border-champagne/50 transition-colors"
      />
      <button
        type="submit"
        disabled={loading}
        className="shrink-0 bg-champagne text-charcoal text-xs font-medium px-3 py-1.5 rounded-md hover:bg-champagne/90 transition-colors disabled:opacity-50"
      >
        {loading ? '...' : 'Subscribe'}
      </button>
    </form>
  );
}
