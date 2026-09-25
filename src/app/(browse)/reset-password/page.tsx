import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Choose a New Password | Mayells',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <ResetPasswordForm />
    </AuthShell>
  );
}
