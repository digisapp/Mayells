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
      <p role="status" className="text-xs text-champagne">You&apos;re subscribed. We&apos;ll keep you posted.</p>
    );
  }

  // Touch sizing (16px text, 44px controls) holds until lg: landscape phones
  // are past sm, and anything under 16px makes iOS zoom on focus.
  return (
    <form onSubmit={handleSubmit} className="flex gap-1.5">
      <input
        type="email"
        name="email"
        required
        aria-label="Email address"
        placeholder="Email for updates"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 min-w-0 h-11 lg:h-auto bg-white/[0.06] border border-white/15 rounded-md px-3 py-1.5 text-base lg:text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-champagne/50 transition-colors"
      />
      <button
        type="submit"
        disabled={loading}
        className="shrink-0 h-11 lg:h-auto bg-champagne text-charcoal text-sm lg:text-xs font-medium px-4 lg:px-3 py-1.5 rounded-md hover:bg-champagne/90 transition-colors disabled:opacity-50"
      >
        {loading ? '...' : 'Subscribe'}
      </button>
    </form>
  );
}
