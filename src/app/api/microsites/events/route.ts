import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@/db';
import { micrositeEvents } from '@/db/schema';
import { getClientIp } from '@/lib/request-ip';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { MICROSITE_SLUGS } from '@/lib/microsites/config';

// Crawlers, link unfurlers and uptime checks run JavaScript often enough to
// inflate a small site's numbers; they are not visitors.
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch/i;

const short = z.string().trim().max(100).optional();

const eventSchema = z.object({
  site: z.enum(MICROSITE_SLUGS as [string, ...string[]]),
  type: z.enum(['view', 'call', 'form_start']),
  placement: z.string().regex(/^[a-z_-]{1,20}$/).optional(),
  referrer: z.string().max(2000).optional(),
  utmSource: short,
  utmMedium: short,
  utmCampaign: short,
});

/** Host of an external referrer; null for direct visits and same-site navigation. */
function referrerHost(referrer: string | undefined, ownHost: string | null): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '').toLowerCase();
    const own = ownHost?.split(':')[0].replace(/^www\./, '').toLowerCase();
    return host && host !== own ? host.slice(0, 100) : null;
  } catch {
    return null;
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

/**
 * Public beacon for the city microsites (see MicrositeTracker and CallLink).
 * Always answers 204 so a browser has nothing to retry and a bot learns
 * nothing about what was kept.
 */
export async function POST(req: NextRequest) {
  const done = new NextResponse(null, { status: 204 });
  try {
    const ua = req.headers.get('user-agent') ?? '';
    if (!ua || BOT_UA.test(ua)) return done;

    const ip = getClientIp(req);
    const { success } = await rateLimit(`microsite-event:${ip}`, { maxRequests: 60, windowSeconds: 600 });
    if (!success) return done;

    // sendBeacon posts text/plain, so parse the body by hand.
    const raw = await req.text();
    if (raw.length > 4000) return done;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return done;
    }
    const parsed = eventSchema.safeParse(json);
    if (!parsed.success) return done;
    const e = parsed.data;

    await db.insert(micrositeEvents).values({
      site: e.site,
      type: e.type,
      placement: e.placement ?? null,
      referrerHost: referrerHost(e.referrer, req.headers.get('host')),
      utmSource: e.utmSource || null,
      utmMedium: e.utmMedium || null,
      utmCampaign: e.utmCampaign || null,
      device: /mobi|iphone|android/i.test(ua) ? 'mobile' : 'desktop',
      visitorHash: visitorHash(ip, ua),
    });
  } catch (err) {
    logger.error('Microsite event insert failed', err);
  }
  return done;
}
