import { db } from '@/db';
import { siteEvents, sellerProspects } from '@/db/schema';
import { and, desc, isNotNull, ne, sql } from 'drizzle-orm';
import { MICROSITES } from '@/lib/microsites/config';

export interface MicrositeRow {
  slug: string;
  city: string;
  domain: string;
  views: number;
  visitors: number;
  calls: number;
  formStarts: number;
  leads: number;
  mobileViews: number;
}

// pg returns count() as bigint strings; normalise at the edge.
const n = (v: unknown) => Number(v ?? 0);

// site_events also holds mayells.com traffic (the admin Analytics page).
const ONLY_MICROSITES = ne(siteEvents.site, 'mayells');

/**
 * Per-city traffic and leads over the last `days` days, one row per
 * configured microsite (zeros included, so a quiet city still shows up).
 * Leads come from seller_prospects.site — what actually arrived — not from
 * a browser-reported event.
 */
export async function getMicrositeRows(days: number): Promise<MicrositeRow[]> {
  const since = sql`now() - (${days}::int * interval '1 day')`;
  const [eventRows, leadRows] = await Promise.all([
    db
      .select({
        site: siteEvents.site,
        views: sql<number>`count(*) filter (where ${siteEvents.type} = 'view')`,
        visitors: sql<number>`count(distinct ${siteEvents.visitorHash}) filter (where ${siteEvents.type} = 'view')`,
        calls: sql<number>`count(*) filter (where ${siteEvents.type} = 'call')`,
        formStarts: sql<number>`count(*) filter (where ${siteEvents.type} = 'form_start')`,
        mobileViews: sql<number>`count(*) filter (where ${siteEvents.type} = 'view' and ${siteEvents.device} = 'mobile')`,
      })
      .from(siteEvents)
      .where(and(ONLY_MICROSITES, sql`${siteEvents.createdAt} >= ${since}`))
      .groupBy(siteEvents.site),
    db
      .select({ site: sellerProspects.site, leads: sql<number>`count(*)` })
      .from(sellerProspects)
      .where(and(isNotNull(sellerProspects.site), sql`${sellerProspects.createdAt} >= ${since}`))
      .groupBy(sellerProspects.site),
  ]);

  const events = new Map(eventRows.map((r) => [r.site, r]));
  const leads = new Map(leadRows.map((r) => [r.site, n(r.leads)]));
  return MICROSITES.map((m) => {
    const e = events.get(m.slug);
    return {
      slug: m.slug,
      city: m.city,
      domain: m.domain,
      views: n(e?.views),
      visitors: n(e?.visitors),
      calls: n(e?.calls),
      formStarts: n(e?.formStarts),
      leads: leads.get(m.slug) ?? 0,
      mobileViews: n(e?.mobileViews),
    };
  });
}

export interface TrafficSource {
  source: string;
  views: number;
  visitors: number;
  calls: number;
}

/** Where visits came from: utm_source when tagged, else the referring host. */
export async function getMicrositeSources(days: number, limit = 10): Promise<TrafficSource[]> {
  const source = sql<string>`coalesce(${siteEvents.utmSource}, ${siteEvents.referrerHost}, 'Direct / typed')`;
  const rows = await db
    .select({
      source,
      views: sql<number>`count(*) filter (where ${siteEvents.type} = 'view')`,
      visitors: sql<number>`count(distinct ${siteEvents.visitorHash}) filter (where ${siteEvents.type} = 'view')`,
      calls: sql<number>`count(*) filter (where ${siteEvents.type} = 'call')`,
    })
    .from(siteEvents)
    .where(and(ONLY_MICROSITES, sql`${siteEvents.createdAt} >= now() - (${days}::int * interval '1 day')`))
    .groupBy(source)
    .orderBy(sql`2 desc`)
    .limit(limit);
  return rows.map((r) => ({ source: r.source, views: n(r.views), visitors: n(r.visitors), calls: n(r.calls) }));
}

export async function getRecentMicrositeLeads(limit = 10) {
  return db
    .select({
      id: sellerProspects.id,
      fullName: sellerProspects.fullName,
      site: sellerProspects.site,
      status: sellerProspects.status,
      totalItems: sellerProspects.totalItems,
      createdAt: sellerProspects.createdAt,
    })
    .from(sellerProspects)
    .where(isNotNull(sellerProspects.site))
    .orderBy(desc(sellerProspects.createdAt))
    .limit(limit);
}

/** When the first event was recorded — the page says so, so early zeros aren't misread. */
export async function getMicrositeTrackingStart(): Promise<Date | null> {
  // mapWith applies the column's UTC parsing; a bare min() would be read as local time.
  const [row] = await db
    .select({ first: sql<Date | null>`min(${siteEvents.createdAt})`.mapWith(siteEvents.createdAt) })
    .from(siteEvents)
    .where(ONLY_MICROSITES);
  return row?.first ?? null;
}
