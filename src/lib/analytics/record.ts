import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { db } from '@/db';
import { siteEvents } from '@/db/schema';
import { BUSINESS } from '@/lib/config';
import { getClientIp } from '@/lib/request-ip';
import { rateLimit } from '@/lib/rate-limit';
import { getMicrositeByHost } from '@/lib/microsites/config';

// Crawlers, link unfurlers and uptime checks run JavaScript often enough to
// inflate a small site's numbers; they are not visitors.
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch/i;

const MAIN_HOST = new URL(BUSINESS.url).hostname;

function bareHost(host: string | null | undefined): string {
  return (host ?? '').split(':')[0].toLowerCase().replace(/^www\./, '');
}

/**
 * Which site a request belongs to, from its Host header: `mayells` or a
 * microsite slug. Null for anything else (localhost, preview deployments),
 * so a developer browsing a local build pointed at the production database
 * never lands in the numbers.
 */
export function siteForHost(host: string | null | undefined): string | null {
  const microsite = getMicrositeByHost(host);
  if (microsite) return microsite.slug;
  return bareHost(host) === MAIN_HOST ? 'mayells' : null;
}

/** Host of an external referrer; null for direct visits and same-site navigation. */
export function externalReferrerHost(referrer: string | null | undefined, ownHost: string | null): string | null {
  if (!referrer) return null;
  try {
    const host = bareHost(new URL(referrer).hostname);
    return host && host !== bareHost(ownHost) ? host.slice(0, 100) : null;
  } catch {
    return null;
  }
}

/** True when the referrer is another page of the same site. */
function isInternalReferrer(referrer: string | null | undefined, ownHost: string | null): boolean {
  if (!referrer) return false;
  try {
    return bareHost(new URL(referrer).hostname) === bareHost(ownHost);
  } catch {
    return false;
  }
}

/**
 * Daily-rotating visitor key: the same person on the same day hashes the
 * same, so unique visitors can be counted, but the IP and user agent are
 * never stored and yesterday's key cannot be linked to today's.
 */
function visitorHash(ip: string, ua: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return crypto.createHash('sha256').update(`${salt}|${day}|${ip}|${ua}`).digest('hex').slice(0, 32);
}

function device(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet|android(?!.*mobi)/i.test(ua)) return 'tablet';
  return /mobi|iphone|android/i.test(ua) ? 'mobile' : 'desktop';
}

/** Vercel's IP geolocation headers; the city arrives URL-encoded. */
function geo(headers: Headers): { country: string | null; region: string | null; city: string | null } {
  const read = (name: string) => {
    const value = headers.get(name);
    if (!value) return null;
    try {
      return decodeURIComponent(value).slice(0, 80);
    } catch {
      return null;
    }
  };
  return {
    country: read('x-vercel-ip-country'),
    region: read('x-vercel-ip-country-region'),
    city: read('x-vercel-ip-city'),
  };
}

export interface SiteEventInput {
  type: 'view' | 'call' | 'form_start' | 'chat';
  /** Already normalised (see normalizePath). */
  path: string | null;
  /** A client-side navigation within the site, which never begins a visit. */
  nav?: boolean;
  placement?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

/**
 * Store one traffic event for the admin Analytics page. Silently drops bots,
 * unknown hosts and bursts from one IP; the caller answers the same way
 * whatever happens here, so a bot learns nothing about what was kept.
 */
export async function recordSiteEvent(req: NextRequest, input: SiteEventInput): Promise<void> {
  const ua = req.headers.get('user-agent') ?? '';
  if (!ua || BOT_UA.test(ua)) return;
  const host = req.headers.get('host');
  const site = siteForHost(host);
  if (!site) return;

  const ip = getClientIp(req);
  const { success } = await rateLimit(`site-event:${ip}`, { maxRequests: 120, windowSeconds: 600 });
  if (!success) return;

  await db.insert(siteEvents).values({
    site,
    type: input.type,
    path: input.path,
    entry: input.type === 'view' && !input.nav && !isInternalReferrer(input.referrer, host),
    placement: input.placement ?? null,
    referrerHost: externalReferrerHost(input.referrer, host),
    utmSource: input.utmSource || null,
    utmMedium: input.utmMedium || null,
    utmCampaign: input.utmCampaign || null,
    device: device(ua),
    ...geo(req.headers),
    visitorHash: visitorHash(ip, ua),
  });
}
