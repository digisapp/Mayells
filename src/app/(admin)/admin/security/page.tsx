import { redirect } from 'next/navigation';

/** Two-factor setup lives on the Security tab of /admin/settings now. */
export default function SecurityRedirectPage() {
  redirect('/admin/settings?tab=security');
}
