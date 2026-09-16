import { redirect } from 'next/navigation';

/** Automation settings live under /admin/settings now. */
export default function AutomationRedirectPage() {
  redirect('/admin/settings?tab=sales');
}
