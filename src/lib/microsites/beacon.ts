import { sendFormStart } from '@/lib/analytics/beacon';

/**
 * The city form's hook into the admin traffic log. Page views and call taps
 * are recorded site-wide by SiteTracker, and the site comes from the domain,
 * so all that is left for a microsite to report is where its form was
 * started. Shares SiteTracker's once-per-page-view guard, so the two never
 * count the same start twice.
 */
export function sendMicrositeEvent(_site: string, type: 'form_start', placement?: string): void {
  if (type === 'form_start') sendFormStart('lead', placement);
}
