import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { normalizePath } from '@/lib/analytics/paths';
import { recordSiteEvent } from '@/lib/analytics/record';

const short = z.string().trim().max(100).optional();

const eventSchema = z.object({
  type: z.enum(['view', 'call', 'form_start']),
  path: z.string().max(2000),
  nav: z.boolean().optional(),
  placement: z.string().regex(/^[a-z_-]{1,20}$/).optional(),
  referrer: z.string().max(2000).optional(),
  utmSource: short,
  utmMedium: short,
  utmCampaign: short,
});

/**
 * Public beacon for SiteTracker: page views, phone-number taps and form
 * starts on mayells.com and the city domains. The bland path is deliberate:
 * content blockers drop requests to URLs that look like analytics.
 *
 * Always answers 204, so a browser has nothing to retry and a bot learns
 * nothing about what was kept.
 */
export async function POST(req: NextRequest) {
  const done = new NextResponse(null, { status: 204 });
  try {
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

    const path = normalizePath(e.path);
    if (!path) return done;

    await recordSiteEvent(req, { ...e, path });
  } catch (err) {
    logger.error('Site event insert failed', err);
  }
  return done;
}
