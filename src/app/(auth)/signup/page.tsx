import { SignupForm } from '@/components/auth/SignupForm';

export const metadata = {
  title: 'Create Account — Mayell',
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return <SignupForm />;
}
