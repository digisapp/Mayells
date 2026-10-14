'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { EmailLinkType } from '@/lib/auth/email-link';
import { AuthError, AuthHeading, AUTH_LINK } from './AuthShell';

type LinkType = EmailLinkType;

const COPY: Record<LinkType, { title: string; body: string; action: string }> = {
  recovery: {
    title: 'Reset your password',
    body: 'Continue to choose a new password for your Mayells account.',
    action: 'Continue',
  },
  signup: {
    title: 'Confirm your email',
    body: 'Continue to confirm your address and sign in to Mayells.',
    action: 'Confirm and sign in',
  },
  email: {
    title: 'Confirm your email',
    body: 'Continue to confirm your address and sign in to Mayells.',
    action: 'Confirm and sign in',
  },
};

/**
 * The step between an emailed link and the session: the token is spent only
 * when the reader presses the button here.
 */
export function ConfirmEmailLink({ tokenHash, type, next }: { tokenHash: string; type: LinkType; next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const copy = COPY[type];

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenHash, type, next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.redirect === 'string') {
        // A full navigation so every server component sees the new session.
        window.location.assign(data.redirect);
        return;
      }
      setBusy(false);
      if (res.status === 410) {
        setExpired(true);
        return;
      }
      setError(data.error || 'Something went wrong. Please try again.');
    } catch {
      setBusy(false);
      setError('Couldn’t connect. Check your connection and try again.');
    }
  }

  if (expired) {
    return type === 'recovery' ? (
      <div>
        <AuthHeading title="This link has expired">
          Password reset links work once and only for a limited time. Request a new one and we&rsquo;ll email it
          to you straight away.
        </AuthHeading>
        <Button asChild size="lg" className="mt-8 w-full">
          <Link href="/forgot-password">Send a new link</Link>
        </Button>
      </div>
    ) : (
      <div>
        <AuthHeading title="This link has expired">
          Confirmation links work once and only for a limited time. If you already confirmed, just sign in.
        </AuthHeading>
        <Button asChild size="lg" className="mt-8 w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading title={copy.title}>{copy.body}</AuthHeading>
      {error && <div className="mt-8"><AuthError>{error}</AuthError></div>}
      <Button type="button" size="lg" className="mt-8 w-full" onClick={confirm} disabled={busy}>
        {busy ? 'One moment…' : copy.action}
      </Button>
      <p className="mt-6 text-[14px] text-muted-foreground">
        Didn&rsquo;t ask for this email? You can close this page; nothing changes until you continue.{' '}
        <Link href="/" className={AUTH_LINK}>Go to Mayells</Link>
      </p>
    </div>
  );
}
