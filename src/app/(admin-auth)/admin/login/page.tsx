import { Suspense } from 'react';
import { AdminLoginForm } from '@/components/auth/AdminLoginForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Sign In — Mayell',
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}
