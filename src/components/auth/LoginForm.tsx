'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { AuthError, AuthHeading, AUTH_INPUT, AUTH_LINK } from './AuthShell';
import { ResendConfirmation } from './ResendConfirmation';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ message: data.error || 'We couldn’t sign you in just now. Please try again.', code: data.code });
        return;
      }
      // Admins landing here without an explicit destination go to the
      // dashboard, not the homepage.
      router.push(data.role === 'admin' && next === '/' ? '/admin' : next);
      router.refresh();
    } catch {
      setError({ message: 'Couldn’t connect. Check your connection and try again.' });
    } finally {
      setIsLoading(false);
    }
  }

  const signupHref = `/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <div>
      <AuthHeading title="Sign in">Welcome back. Sign in to bid, follow lots and see your invoices.</AuthHeading>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {error && (
          <AuthError>
            {error.message}
            {error.code === 'invalid_credentials' && (
              <>
                {' '}
                <Link href="/forgot-password" className="font-medium underline underline-offset-2">
                  Reset your password
                </Link>
              </>
            )}
            {error.code === 'email_not_confirmed' && <ResendConfirmation email={email} />}
          </AuthError>
        )}
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="-my-3 inline-flex min-h-11 items-center text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT}
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-center text-[15px] text-muted-foreground">
        New to Mayells?{' '}
        <Link href={signupHref} className={AUTH_LINK}>
          Create an account
        </Link>
      </p>

      <div className="mt-8 border-t border-border pt-6 text-[14px] leading-relaxed text-muted-foreground">
        Selling something? You don&rsquo;t need an account.{' '}
        <Link href="/consign" className={`${AUTH_LINK} inline-flex items-center gap-1`}>
          Request a free appraisal
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
