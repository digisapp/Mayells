/**
 * Report a microsite event to /api/microsites/events for the admin's
 * Microsites page. Fire-and-forget: sendBeacon survives the page unloading
 * (a tap on a tel: link can background the tab immediately), and nothing
 * here may ever block or break the page.
 */
export function sendMicrositeEvent(
  site: string,
  type: 'view' | 'call' | 'form_start',
  placement?: string,
): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const body = JSON.stringify({
      site,
      type,
      placement,
      referrer: document.referrer || undefined,
      utmSource: params.get('utm_source') ?? undefined,
      utmMedium: params.get('utm_medium') ?? undefined,
      utmCampaign: params.get('utm_campaign') ?? undefined,
    });
    if (navigator.sendBeacon?.('/api/microsites/events', body)) return;
    void fetch('/api/microsites/events', { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch {
    // Analytics must never surface to the visitor.
  }
}
