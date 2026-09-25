/**
 * Browser side of the admin traffic log (see SiteTracker and /api/pv).
 * Fire-and-forget: sendBeacon survives the page unloading (a tap on a tel:
 * link can background the tab immediately), and nothing here may ever block
 * or break the page.
 */

const OPT_OUT_KEY = 'mayells:analytics-off';

/** True once this browser has been marked as staff (see SiteTracker). */
export function analyticsOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAnalyticsOptOut(off: boolean): void {
  try {
    if (off) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // Private mode or blocked storage: this browser just keeps counting.
  }
}

export function sendSiteEvent(
  type: 'view' | 'call' | 'form_start',
  options: { placement?: string; nav?: boolean } = {},
): void {
  try {
    if (analyticsOptedOut()) return;
    const params = new URLSearchParams(window.location.search);
    const body = JSON.stringify({
      type,
      path: window.location.pathname,
      nav: options.nav || undefined,
      placement: options.placement,
      // After a client-side navigation this is still the page the visit
      // arrived from, which is the source every event in it belongs to.
      referrer: document.referrer || undefined,
      utmSource: params.get('utm_source') ?? undefined,
      utmMedium: params.get('utm_medium') ?? undefined,
      utmCampaign: params.get('utm_campaign') ?? undefined,
    });
    if (navigator.sendBeacon?.('/api/pv', body)) return;
    void fetch('/api/pv', { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch {
    // Analytics must never surface to the visitor.
  }
}

let formsStarted = new Set<string>();

/** Called on every page view, so each view can start each form once. */
export function resetFormStarts(): void {
  formsStarted = new Set();
}

/** One form start per form per page view, however many fields the visitor touches. */
export function sendFormStart(form: string, placement?: string): void {
  if (formsStarted.has(form)) return;
  formsStarted.add(form);
  sendSiteEvent('form_start', { placement });
}

/**
 * An appraisal or consignment request form: somewhere to leave a phone or
 * email plus a description or photos, and no password. Matches the home
 * page, /consign and city forms without tagging each one, and leaves out
 * search, sign-in, newsletter, bidding and chat.
 */
export function isLeadForm(form: Pick<Element, 'querySelector'>): boolean {
  return (
    form.querySelector('input[type="tel"], input[type="email"]') !== null &&
    form.querySelector('textarea, input[type="file"]') !== null &&
    form.querySelector('input[type="password"]') === null
  );
}
