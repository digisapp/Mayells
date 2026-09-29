'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { CheckCircle2, FileSignature, Loader2 } from 'lucide-react';
import { useHideChatLauncher } from '@/components/chat/use-hide-chat-launcher';

export function SignAgreementForm({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const [signedName, setSignedName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Field messages appear once the signer has tried to submit, then track
  // their edits, so the button never sits disabled without saying why.
  const [attempted, setAttempted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // The bubble would sit on the sign button on a phone.
  useHideChatLauncher(formRef);

  const nameError = signedName.trim().length < 2 ? 'Please type your full legal name.' : null;
  const agreeError = !agreed ? 'Please confirm you agree to the consignment terms.' : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAttempted(true);

    if (nameError) {
      document.getElementById('signedName')?.focus();
      return;
    }
    if (agreeError) {
      document.getElementById('agreeTerms')?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/consignment-agreement/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectId,
          signedName: signedName.trim(),
          agree: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to sign the agreement. Please try again.');
        return;
      }
      setDone(true);
      // Re-render the server page so the signed confirmation state shows.
      router.refresh();
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="border border-green-200 bg-green-50 rounded-xl p-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-3" />
        <p className="font-medium text-green-900">Agreement signed — thank you!</p>
        <p className="text-sm text-green-800/80 mt-1">
          We&apos;ve recorded your signature. Our team will be in touch with next steps.
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="border border-border/60 rounded-xl p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <FileSignature className="h-5 w-5 text-champagne" />
        <h3 className="font-display text-lg">Sign the Agreement</h3>
      </div>

      <div className="space-y-2">
        <Label htmlFor="signedName">
          Full legal name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="signedName"
          value={signedName}
          onChange={(e) => setSignedName(e.target.value)}
          placeholder="Type your full name as your signature"
          maxLength={200}
          autoComplete="name"
          required
          aria-invalid={attempted && !!nameError}
          aria-describedby={attempted && nameError ? 'signedName-hint signedName-error' : 'signedName-hint'}
          className="h-11 text-base md:text-base"
        />
        <p id="signedName-hint" className="text-xs text-muted-foreground">
          Typing your name here acts as your electronic signature.
        </p>
        {attempted && nameError && (
          <p id="signedName-error" className="text-sm text-destructive">{nameError}</p>
        )}
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="agreeTerms"
          checked={agreed}
          onCheckedChange={(checked) => setAgreed(checked === true)}
          aria-invalid={attempted && !!agreeError}
          aria-describedby={attempted && agreeError ? 'agreeTerms-error' : undefined}
          className="mt-0.5"
        />
        <Label htmlFor="agreeTerms" className="text-sm font-normal leading-snug cursor-pointer">
          I have read and agree to the consignment terms above, including the
          commission rate, payment timeline, and withdrawal policy.
        </Label>
      </div>
      {attempted && agreeError && (
        <p id="agreeTerms-error" className="-mt-2 text-sm text-destructive">{agreeError}</p>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        size="lg"
        disabled={submitting}
        className="w-full bg-champagne text-charcoal hover:bg-champagne/90"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Signing...
          </>
        ) : (
          'Sign Agreement'
        )}
      </Button>
    </form>
  );
}
