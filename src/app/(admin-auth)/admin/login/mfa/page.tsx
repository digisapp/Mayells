import { Suspense } from 'react';
import { AdminMfaChallengeForm } from '@/components/auth/AdminMfaChallengeForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Two-Factor Code — Mayells',
  robots: { index: false, follow: false },
};

export default function AdminMfaPage() {
  return (
    <Suspense>
      <AdminMfaChallengeForm />
    </Suspense>
  );
}
