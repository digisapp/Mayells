'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthError, AuthHeading, AUTH_INPUT, AUTH_LINK } from './AuthShell';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('Couldn’t connect. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  if (sent) {
    return (
      <div>
        <MailCheck className="h-9 w-9 text-champagne-deep" aria-hidden />
        <div className="mt-4">
          <AuthHeading title="Check your inbox">
            If there&rsquo;s an account for <span className="font-medium text-foreground">{email}</span>, a link to set a
            new password is on its way. It can take a few minutes, and may land in spam.
          </AuthHeading>
        </div>
        <Button asChild size="lg" variant="outline" className="mt-8 w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading title="Reset your password">
        Enter the email you signed up with and we&rsquo;ll send you a link to choose a new password.
      </AuthHeading>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {error && <AuthError>{error}</AuthError>}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT}
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className="mt-6 text-center text-[15px] text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className={AUTH_LINK}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
