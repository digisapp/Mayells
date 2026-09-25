import type { Metadata } from 'next';
import { AuthError, AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';
import { redirectIfSignedIn } from '@/lib/auth/redirect-if-signed-in';
import { safeNext } from '@/lib/auth/safe-next';

export const metadata: Metadata = {
  title: 'Sign In | Mayells',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  await redirectIfSignedIn(next);

  return (
    <AuthShell>
      {error && (
        <div className="mb-6">
          <AuthError>That link has expired or was already used. Please sign in, or request a new link.</AuthError>
        </div>
      )}
      <LoginForm next={next} />
    </AuthShell>
  );
}
