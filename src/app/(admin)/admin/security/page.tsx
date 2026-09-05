import type { Metadata } from 'next';
import { MfaSettings } from '@/components/admin/MfaSettings';

export const metadata: Metadata = {
  title: 'Security — Mayells Admin',
  robots: { index: false, follow: false },
};

export default function AdminSecurityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Protect this admin account with a second factor.
        </p>
      </div>
      <MfaSettings />
    </div>
  );
}
