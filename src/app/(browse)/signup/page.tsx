import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { SignupForm } from '@/components/auth/SignupForm';
import { redirectIfSignedIn } from '@/lib/auth/redirect-if-signed-in';
import { safeNext } from '@/lib/auth/safe-next';

export const metadata: Metadata = {
  title: 'Create Account | Mayells',
  robots: { index: false, follow: false },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  await redirectIfSignedIn(next);

  return (
    <AuthShell>
      <SignupForm next={next} />
    </AuthShell>
  );
}
