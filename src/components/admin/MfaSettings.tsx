'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, ShieldOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Factor {
  id: string;
  factor_type: string;
  status: 'verified' | 'unverified';
  friendly_name?: string | null;
  created_at?: string;
}

interface PendingEnrollment {
  factorId: string;
  qrCode: string; // data: URL (SVG) from Supabase
  secret: string;
}

/**
 * Admin two-factor setup. Factors live in Supabase Auth; the app only busts
 * the middleware's cached "enrolled" flag afterwards. Once a factor is
 * verified, every admin page and API call requires the 6-digit code after
 * password login (see src/middleware.ts).
 */
export function MfaSettings() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState<Factor[]>([]);
  const [pending, setPending] = useState<PendingEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshCache = useCallback(async () => {
    await fetch('/api/auth/mfa/refresh', { method: 'POST' }).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const all = (data?.all ?? []) as Factor[];
    setVerified(all.filter((f) => f.factor_type === 'totp' && f.status === 'verified'));
    // Abandoned enrollments (QR shown, never confirmed) are dead weight —
    // Supabase caps factors per user, so clear them out.
    for (const f of all.filter((f) => f.factor_type === 'totp' && f.status === 'unverified')) {
      await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => undefined);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function startEnroll() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Mayells Admin ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error || !data) {
        toast.error(error?.message ?? 'Could not start enrollment');
        return;
      }
      setPending({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnroll() {
    if (!pending) return;
    setBusy(true);
    try {
      await supabase.auth.mfa.unenroll({ factorId: pending.factorId });
    } catch {
      // the factor is unverified; it is harmless if this fails
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: pending.factorId,
        code: code.replace(/\s/g, ''),
      });
      if (error) {
        toast.error(error.message.includes('Invalid') ? 'That code was not accepted. Check the time on your phone and try again.' : error.message);
        return;
      }
      await refreshCache();
      setPending(null);
      setCode('');
      toast.success('Two-factor authentication is on for this account');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function disable(factorId: string) {
    if (!confirm('Turn off two-factor authentication for this account?')) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        toast.error(
          /aal2|assurance/i.test(error.message)
            ? 'Sign out and back in (entering your code) before turning this off.'
            : error.message,
        );
        return;
      }
      await refreshCache();
      toast.success('Two-factor authentication turned off');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {verified.length > 0 ? (
              <ShieldCheck className="h-5 w-5 text-green-600" />
            ) : (
              <ShieldOff className="h-5 w-5 text-muted-foreground" />
            )}
            Two-factor authentication
          </CardTitle>
          <CardDescription>
            {verified.length > 0
              ? 'On. After entering your password you will be asked for a 6-digit code from your authenticator app.'
              : 'Off. Add an authenticator app (1Password, Google Authenticator, Authy…) so a stolen password alone cannot reach the admin panel.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {verified.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">{f.friendly_name || 'Authenticator app'}</p>
                {f.created_at && (
                  <p className="text-xs text-muted-foreground">Added {new Date(f.created_at).toLocaleDateString()}</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => disable(f.id)} disabled={busy}>
                Turn off
              </Button>
            </div>
          ))}

          {!pending && verified.length === 0 && (
            <Button onClick={startEnroll} disabled={busy}>
              {busy ? 'Starting…' : 'Set up authenticator app'}
            </Button>
          )}

          {pending && (
            <form onSubmit={confirmEnroll} className="space-y-4 rounded-md border p-4">
              <p className="text-sm">
                Scan this code with your authenticator app, then enter the 6-digit code it shows.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URL from Supabase */}
                <img src={pending.qrCode} alt="Authenticator QR code" className="h-44 w-44 rounded bg-white p-2 border" />
                <div className="text-xs text-muted-foreground space-y-1 break-all">
                  <p>Can&rsquo;t scan? Enter this key manually:</p>
                  <code className="block rounded bg-muted px-2 py-1 text-foreground">{pending.secret}</code>
                </div>
              </div>
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="mfa-code">6-digit code</Label>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]{6,7}"
                  placeholder="123 456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6}>
                  {busy ? 'Verifying…' : 'Turn on'}
                </Button>
                <Button type="button" variant="ghost" onClick={cancelEnroll} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Lost your device? An operator can remove the factor with{' '}
        <code>npx tsx scripts/admin-mfa-reset.ts you@mayells.com</code> using the service-role key.
      </p>
    </div>
  );
}
