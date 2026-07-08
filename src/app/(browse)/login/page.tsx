import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Sign In | Mayells',
  robots: { index: false, follow: false },
};

function safeNext(next?: string): string {
  // Only allow internal same-origin paths (block open redirects).
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16">
      {error && (
        <div className="mb-4 w-full max-w-md rounded-md bg-red-500/10 p-3 text-center text-sm text-red-500">
          Your session could not be verified. Please sign in again.
        </div>
      )}
      <LoginForm next={safeNext(next)} />
    </div>
  );
}
