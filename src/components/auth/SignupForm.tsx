'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { AuthError, AuthHeading, AUTH_INPUT, AUTH_LINK } from './AuthShell';
import { ResendConfirmation } from './ResendConfirmation';

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'We couldn’t create your account just now. Please try again.');
        return;
      }
      if (data.needsConfirmation) {
        setAwaitingConfirmation(true);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError('Couldn’t connect. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  const loginHref = `/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;

  if (awaitingConfirmation) {
    return (
      <div>
        <MailCheck className="h-9 w-9 text-champagne-deep" aria-hidden />
        <div className="mt-4">
          <AuthHeading title="Check your inbox">
            We&rsquo;ve sent a confirmation link to <span className="font-medium text-foreground">{email}</span>. Open it to
            finish creating your account, then sign in.
          </AuthHeading>
        </div>
        <div className="mt-6 rounded-lg bg-secondary px-4 py-3 text-[14px] leading-relaxed text-muted-foreground">
          Nothing there after a few minutes? Check your spam folder.
          <ResendConfirmation email={email} className="text-foreground" />
        </div>
        <Button asChild size="lg" variant="outline" className="mt-6 w-full">
          <Link href={loginHref}>Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading title="Create an account">Register to bid in our sales and keep a watchlist.</AuthHeading>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {error && <AuthError>{error}</AuthError>}
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={AUTH_INPUT}
          />
        </div>
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
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-describedby="password-hint"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT}
          />
          <p id="password-hint" className="text-[13px] text-muted-foreground">
            At least 8 characters.
          </p>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? 'Creating your account…' : 'Create account'}
        </Button>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          By creating an account you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <p className="mt-6 text-center text-[15px] text-muted-foreground">
        Already have an account?{' '}
        <Link href={loginHref} className={AUTH_LINK}>
          Sign in
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
