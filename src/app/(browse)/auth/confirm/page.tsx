import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell, AuthHeading } from '@/components/auth/AuthShell';
import { ConfirmEmailLink } from '@/components/auth/ConfirmEmailLink';
import { Button } from '@/components/ui/button';
import { emailOtpType } from '@/lib/auth/email-link';
import { safeNext } from '@/lib/auth/safe-next';

export const metadata: Metadata = {
  title: 'Confirm',
  robots: { index: false, follow: false },
};

// Where emailed sign-up and password-reset links land (see
// docs/AUTH_EMAIL_TEMPLATES.md). Nothing is verified on this GET.
export default async function ConfirmEmailLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string | string[]; type?: string | string[]; next?: string | string[] }>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tokenHash = one(sp.token_hash);
  const type = emailOtpType(one(sp.type));

  return (
    <AuthShell>
      {tokenHash && type ? (
        <ConfirmEmailLink tokenHash={tokenHash} type={type} next={safeNext(one(sp.next))} />
      ) : (
        <div>
          <AuthHeading title="This link is incomplete">
            Open the link again from the email, or copy the whole address into your browser.
          </AuthHeading>
          <Button asChild size="lg" className="mt-8 w-full">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
