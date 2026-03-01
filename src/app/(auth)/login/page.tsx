import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata = {
  title: 'Sign In — Mayells',
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
