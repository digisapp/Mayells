'use client';

import { useState } from 'react';

/**
 * "Send a new link" for an account whose email isn't confirmed yet. The
 * server answers the same either way, so this only ever reports that a link
 * is on its way.
 */
export function ResendConfirmation({ email, className = '' }: { email: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function resend() {
    setState('sending');
    try {
      const res = await fetch('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setState('sent');
        return;
      }
      const data = await res.json().catch(() => null);
      setMessage(data?.error || 'We couldn’t send a new link just now. Please try again later.');
      setState('error');
    } catch {
      setMessage('Couldn’t connect. Check your connection and try again.');
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <span role="status" className={`mt-2 block font-medium ${className}`}>
        A new link is on its way to {email}. Check your spam folder too.
      </span>
    );
  }

  return (
    <span className={`mt-1 block ${className}`}>
      <button
        type="button"
        onClick={resend}
        disabled={state === 'sending' || !email}
        className="inline-flex min-h-11 items-center font-medium underline underline-offset-2 disabled:opacity-60"
      >
        {state === 'sending' ? 'Sending…' : 'Send a new confirmation link'}
      </button>
      {state === 'error' && <span className="block">{message}</span>}
    </span>
  );
}
