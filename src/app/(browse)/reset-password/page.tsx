import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Choose a New Password',
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  // The emailed link signs the user in on its way here (see
  // /api/auth/callback, which also sends a failed link here). No session
  // means the link was used or has expired: say so now, not after they have
  // typed two passwords.
  // Outside the try: a request-time API signals dynamic rendering by
  // throwing, which the catch below must not swallow.
  await cookies();
  let linkValid = true;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    linkValid = !!user;
  } catch {
    // Auth unreachable: show the form; the submit reports any problem.
  }

  return (
    <AuthShell>
      <ResetPasswordForm linkValid={linkValid} />
    </AuthShell>
  );
}
