'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { AuthError, AuthHeading, AUTH_INPUT } from './AuthShell';

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('The two passwords don’t match.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) setExpired(true);
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      // Recovery already signed them in; land them where they belong.
      router.push(data.role === 'admin' ? '/admin' : '/');
      router.refresh();
    } catch {
      setError('Couldn’t connect. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <AuthHeading title="Choose a new password">Pick something you haven&rsquo;t used here before.</AuthHeading>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {error && (
          <AuthError>
            {error}
            {expired && (
              <>
                {' '}
                <Link href="/forgot-password" className="font-medium underline underline-offset-2">
                  Request a new link
                </Link>
              </>
            )}
          </AuthError>
        )}
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-describedby="new-password-hint"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT}
          />
          <p id="new-password-hint" className="text-[13px] text-muted-foreground">
            At least 8 characters.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={AUTH_INPUT}
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Set new password'}
        </Button>
      </form>
    </div>
  );
}
