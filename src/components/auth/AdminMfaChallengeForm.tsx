'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Only ever bounce back into the admin area — never to an arbitrary URL. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/admin') || raw.startsWith('/admin/login') || raw.startsWith('//')) {
    return '/admin';
  }
  return raw;
}

export function AdminMfaChallengeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const supabase = useMemo(() => createClient(), []);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      const totp = (data?.totp ?? []).find((f) => f.status === 'verified');
      if (error || !totp) {
        // No factor to challenge (or no session): the middleware will route
        // this account to the right place.
        router.replace(error ? '/admin/login' : '/admin');
        return;
      }
      setFactorId(totp.id);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [supabase, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError('');
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.replace(/\s/g, ''),
      });
      if (error) {
        setError('That code was not accepted. Try the next one shown in your app.');
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md border-zinc-800 bg-zinc-900">
      <CardHeader className="text-center">
        <CardTitle className="font-display text-display-sm text-white">Two-factor code</CardTitle>
        <p className="text-sm text-zinc-400 mt-2">Enter the 6-digit code from your authenticator app.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm p-3 rounded-md">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="admin-mfa-code" className="text-zinc-300">Code</Label>
            <Input
              id="admin-mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123 456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              disabled={!ready}
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 tracking-widest text-center text-lg"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading || !ready || code.replace(/\s/g, '').length !== 6}>
            {isLoading ? 'Verifying…' : 'Continue'}
          </Button>
          <button
            type="button"
            onClick={signOut}
            className="w-full text-xs text-zinc-500 hover:text-zinc-300 hover:underline"
          >
            Sign out
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
