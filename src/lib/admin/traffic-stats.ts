import { db } from '@/db';
import { sql, type SQL } from 'drizzle-orm';
import { MICROSITES } from '@/lib/microsites/config';
import { micrositeCity, MICROSITE_LABELS } from '@/lib/microsites/labels';
import { sourceLabel, DIRECT_SOURCE } from '@/lib/analytics/sources';
import { LEAD_CHANNELS, CALL_OUTCOMES, type LeadChannel, type CallOutcome } from '@/lib/analytics/channels';

/*
 * Queries behind the Traffic & leads view of /admin/analytics.
 *
 * Timestamps are stored as UTC wall time (timestamp without time zone). Days
 * are Eastern days, because "today" means today in Palm Beach: range starts
 * are computed as Eastern midnight converted back to UTC, so the created_at
 * indexes still serve every filter. Times are read back as epoch ms, which
 * Postgres computes from a timestamp without time zone as if it were UTC.
 */

export const TRAFFIC_RANGES = [
  { value: 'today', label: 'Today', days: 1, previous: 'vs yesterday by now' },
  { value: '7d', label: '7 days', days: 7, previous: 'vs the 7 days before' },
  { value: '30d', label: '30 days', days: 30, previous: 'vs the 30 days before' },
  { value: '90d', label: '90 days', days: 90, previous: 'vs the 90 days before' },
] as const;

export type TrafficRange = (typeof TRAFFIC_RANGES)[number];

export function parseTrafficRange(value: string | undefined): TrafficRange {
  return TRAFFIC_RANGES.find((r) => r.value === value) ?? TRAFFIC_RANGES[1];
}

/** `mayells` (mayells.com), a microsite slug, or every site. */
export type SiteFilter = string;

export const SITE_OPTIONS: ReadonlyArray<{ value: SiteFilter; label: string }> = [
  { value: 'all', label: 'All sites' },
  { value: 'mayells', label: 'mayells.com' },
  ...MICROSITES.map((m) => ({ value: m.slug, label: m.city })),
];

export function parseSiteFilter(value: string | undefined): SiteFilter {
  return SITE_OPTIONS.some((o) => o.value === value) ? value! : 'all';
}

export function siteName(site: string): string {
  return site === 'mayells' ? 'mayells.com' : micrositeCity(site);
}

export function siteDomain(site: string): string {
  return site === 'mayells' ? 'mayells.com' : (MICROSITE_LABELS[site]?.domain ?? site);
}

// ── Time ────────────────────────────────────────────────────────────────

const TZ = sql.raw(`'America/New_York'`);
/** Now, as the UTC wall time the columns hold. */
const NOW = sql.raw(`(now() at time zone 'UTC')`);
/** Now, as Eastern wall time. */
const NOW_ET = sql`(now() at time zone ${TZ})`;

/** A stored UTC timestamp as Eastern wall time. */
function eastern(col: SQL): SQL {
  return sql`((${col}) at time zone 'UTC' at time zone ${TZ})`;
}

/** An Eastern wall time back to stored UTC. */
function toStored(etWallTime: SQL): SQL {
  return sql`((${etWallTime}) at time zone ${TZ} at time zone 'UTC')`;
}

interface Period {
  /** Start of the range: Eastern midnight `days - 1` days ago. */
  start: SQL;
  /** The same stretch of time one period earlier, for the deltas. */
  prevStart: SQL;
  prevEnd: SQL;
}

function period(days: number): Period {
  const start = toStored(sql`date_trunc('day', ${NOW_ET}) - (${days - 1}::int * interval '1 day')`);
  return {
    start,
    prevStart: sql`(${start} - (${days}::int * interval '1 day'))`,
    prevEnd: sql`(${NOW} - (${days}::int * interval '1 day'))`,
  };
}

/** Hourly buckets for today, daily otherwise, all in Eastern time. */
function buckets(days: number): { unit: SQL; series: SQL; label: SQL; full: SQL } {
  if (days === 1) {
    return {
      unit: sql.raw(`'hour'`),
      series: sql`generate_series(date_trunc('day', ${NOW_ET}), date_trunc('hour', ${NOW_ET}), interval '1 hour')`,
      label: sql.raw(`to_char(b, 'FMHH12 AM')`),
      full: sql.raw(`to_char(b, 'FMHH12:MI AM')`),
    };
  }
  return {
    unit: sql.raw(`'day'`),
    series: sql`generate_series(date_trunc('day', ${NOW_ET}) - (${days - 1}::int * interval '1 day'), date_trunc('day', ${NOW_ET}), interval '1 day')`,
    label: sql.raw(`to_char(b, 'Mon FMDD')`),
    full: sql.raw(`to_char(b, 'Dy, Mon FMDD')`),
  };
}

// ── Filters ─────────────────────────────────────────────────────────────

function eventSite(site: SiteFilter): SQL {
  return site === 'all' ? sql`true` : sql`site = ${site}`;
}

/**
 * How a prospect arrived, from what each intake path writes: `source` plus
 * the origin line at the head of `source_notes` (recordConversationLead in
 * src/lib/prospects/intake.ts for the phone agent and chat, createProspect
 * in /api/appraisal-requests for the forms). Anything else was entered by
 * staff.
 */
const CHANNEL = sql.raw(`(case
  when source = 'phone' and source_notes like 'Taken by the %concierge%' then 'ai_phone'
  when source = 'website' and source_notes like 'Taken by the website chat%' then 'chat'
  when source = 'website' and site is not null then 'city_form'
  when source = 'website' then 'web_form'
  else 'manual' end)`);

/** Leads for a site: mayells.com means its own forms, chat and main phone line, not staff entries. */
function leadSite(site: SiteFilter): SQL {
  if (site === 'all') return sql`true`;
  if (site === 'mayells') return sql`site is null and channel <> 'manual'`;
  return sql`site = ${site}`;
}

/** Calls for a site: the main line belongs to mayells.com. */
function callSite(site: SiteFilter): SQL {
  if (site === 'all') return sql`true`;
  if (site === 'mayells') return sql`site is null`;
  return sql`site = ${site}`;
}

/** Leads with their channel, from the start of the previous period on. */
function leadsSince(since: SQL): SQL {
  return sql`(select id, full_name, site, status, created_at, ${CHANNEL} as channel
    from seller_prospects where created_at >= ${since}) p`;
}

// pg returns count()/sum() as bigint strings; normalise at the edge.
const n = (v: unknown) => Number(v ?? 0);

async function rows<T>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return result.rows as unknown as T[];
}

// ── Summary ─────────────────────────────────────────────────────────────

export interface Pair {
  current: number;
  previous: number;
}

export interface TrafficSummary {
  visitors: Pair;
  visits: Pair;
  views: Pair;
  callTaps: Pair;
  formStarts: Pair;
  chats: Pair;
  leads: Pair;
  leadsByChannel: Record<LeadChannel, number>;
  formLeads: Pair;
  chatLeads: number;
  aiCalls: Pair;
  aiCallOutcomes: Record<CallOutcome, number>;
  aiCallAvgSeconds: number | null;
  signups: { newsletter: Pair; accounts: Pair } | null;
}

export async function getTrafficSummary(days: number, site: SiteFilter): Promise<TrafficSummary> {
  const w = period(days);
  const cur = sql`created_at >= ${w.start}`;
  const prev = sql`created_at >= ${w.prevStart} and created_at < ${w.prevEnd}`;
  const mainSite = site === 'all' || site === 'mayells';

  const [[events], leadRows, [callRow], [signupRow]] = await Promise.all([
    rows<Record<string, string>>(sql`
      select
        count(distinct visitor_hash) filter (where ${cur} and type = 'view') as visitors,
        count(distinct visitor_hash) filter (where ${prev} and type = 'view') as visitors_prev,
        count(*) filter (where ${cur} and entry) as visits,
        count(*) filter (where ${prev} and entry) as visits_prev,
        count(*) filter (where ${cur} and type = 'view') as views,
        count(*) filter (where ${prev} and type = 'view') as views_prev,
        count(*) filter (where ${cur} and type = 'call') as calls,
        count(*) filter (where ${prev} and type = 'call') as calls_prev,
        count(*) filter (where ${cur} and type = 'form_start') as form_starts,
        count(*) filter (where ${prev} and type = 'form_start') as form_starts_prev,
        count(*) filter (where ${cur} and type = 'chat') as chats,
        count(*) filter (where ${prev} and type = 'chat') as chats_prev
      from site_events
      where created_at >= ${w.prevStart} and ${eventSite(site)}
    `),
    rows<{ channel: LeadChannel; cur: string; prev: string }>(sql`
      select channel,
        count(*) filter (where ${cur}) as cur,
        count(*) filter (where ${prev}) as prev
      from ${leadsSince(w.prevStart)}
      where ${leadSite(site)}
      group by channel
    `),
    rows<Record<string, string | null>>(sql`
      select
        count(*) filter (where started_at >= ${w.start}) as calls,
        count(*) filter (where started_at >= ${w.prevStart} and started_at < ${w.prevEnd}) as calls_prev,
        count(*) filter (where started_at >= ${w.start} and outcome = 'lead') as lead,
        count(*) filter (where started_at >= ${w.start} and outcome = 'transferred') as transferred,
        count(*) filter (where started_at >= ${w.start} and outcome = 'info') as info,
        avg(duration_seconds) filter (where started_at >= ${w.start}) as avg_seconds
      from calls
      where started_at >= ${w.prevStart} and ${callSite(site)}
    `),
    mainSite
      ? rows<Record<string, string>>(sql`
          select
            (select count(*) from newsletter_subscribers where subscribed_at >= ${w.start}) as newsletter,
            (select count(*) from newsletter_subscribers where subscribed_at >= ${w.prevStart} and subscribed_at < ${w.prevEnd}) as newsletter_prev,
            (select count(*) from users where created_at >= ${w.start}) as accounts,
            (select count(*) from users where created_at >= ${w.prevStart} and created_at < ${w.prevEnd}) as accounts_prev
        `)
      : Promise.resolve([undefined]),
  ]);

  const byChannel = Object.fromEntries(LEAD_CHANNELS.map((c) => [c.key, 0])) as Record<LeadChannel, number>;
  const byChannelPrev = { ...byChannel };
  for (const r of leadRows) {
    byChannel[r.channel] = n(r.cur);
    byChannelPrev[r.channel] = n(r.prev);
  }
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

  return {
    visitors: { current: n(events.visitors), previous: n(events.visitors_prev) },
    visits: { current: n(events.visits), previous: n(events.visits_prev) },
    views: { current: n(events.views), previous: n(events.views_prev) },
    callTaps: { current: n(events.calls), previous: n(events.calls_prev) },
    formStarts: { current: n(events.form_starts), previous: n(events.form_starts_prev) },
    chats: { current: n(events.chats), previous: n(events.chats_prev) },
    leads: { current: sum(byChannel), previous: sum(byChannelPrev) },
    leadsByChannel: byChannel,
    formLeads: {
      current: byChannel.web_form + byChannel.city_form,
      previous: byChannelPrev.web_form + byChannelPrev.city_form,
    },
    chatLeads: byChannel.chat,
    aiCalls: { current: n(callRow.calls), previous: n(callRow.calls_prev) },
    aiCallOutcomes: { lead: n(callRow.lead), transferred: n(callRow.transferred), info: n(callRow.info) },
    aiCallAvgSeconds: callRow.avg_seconds == null ? null : Math.round(n(callRow.avg_seconds)),
    signups: signupRow
      ? {
          newsletter: { current: n(signupRow.newsletter), previous: n(signupRow.newsletter_prev) },
          accounts: { current: n(signupRow.accounts), previous: n(signupRow.accounts_prev) },
        }
      : null,
  };
}

// ── Time series ─────────────────────────────────────────────────────────

export interface Bucket {
  /** Axis label: "Sep 25" or "3 PM". */
  label: string;
  /** Tooltip label: "Fri, Sep 25" or "3:00 PM". */
  full: string;
}

export interface TrafficPoint extends Bucket {
  visitors: number;
  views: number;
  visits: number;
  callTaps: number;
  formStarts: number;
  chats: number;
}

export async function getTrafficSeries(days: number, site: SiteFilter): Promise<TrafficPoint[]> {
  const w = period(days);
  const b = buckets(days);
  const data = await rows<Record<string, string>>(sql`
    with e as (
      select date_trunc(${b.unit}, ${eastern(sql.raw('created_at'))}) as b,
        count(distinct visitor_hash) filter (where type = 'view') as visitors,
        count(*) filter (where type = 'view') as views,
        count(*) filter (where entry) as visits,
        count(*) filter (where type = 'call') as calls,
        count(*) filter (where type = 'form_start') as form_starts,
        count(*) filter (where type = 'chat') as chats
      from site_events
      where created_at >= ${w.start} and ${eventSite(site)}
      group by 1
    )
    select ${b.label} as label, ${b.full} as "full",
      coalesce(e.visitors, 0) as visitors, coalesce(e.views, 0) as views, coalesce(e.visits, 0) as visits,
      coalesce(e.calls, 0) as calls, coalesce(e.form_starts, 0) as form_starts, coalesce(e.chats, 0) as chats
    from ${b.series} as b
    left join e using (b)
    order by b
  `);
  return data.map((r) => ({
    label: r.label,
    full: r.full,
    visitors: n(r.visitors),
    views: n(r.views),
    visits: n(r.visits),
    callTaps: n(r.calls),
    formStarts: n(r.form_starts),
    chats: n(r.chats),
  }));
}

export interface StackPoint<K extends string> extends Bucket {
  values: Record<K, number>;
}

export async function getLeadSeries(days: number, site: SiteFilter): Promise<StackPoint<LeadChannel>[]> {
  const w = period(days);
  const b = buckets(days);
  const data = await rows<{ label: string; full: string; channel: LeadChannel | null; count: string }>(sql`
    with l as (
      select date_trunc(${b.unit}, ${eastern(sql.raw('created_at'))}) as b, channel, count(*) as count
      from ${leadsSince(w.start)}
      where ${leadSite(site)}
      group by 1, 2
    )
    select ${b.label} as label, ${b.full} as "full", l.channel, coalesce(l.count, 0) as count
    from ${b.series} as b
    left join l using (b)
    order by b
  `);
  return stack(data, 'channel', LEAD_CHANNELS.map((c) => c.key));
}

export async function getCallSeries(days: number, site: SiteFilter): Promise<StackPoint<CallOutcome>[]> {
  const w = period(days);
  const b = buckets(days);
  const data = await rows<{ label: string; full: string; outcome: CallOutcome | null; count: string }>(sql`
    with c as (
      select date_trunc(${b.unit}, ${eastern(sql.raw('started_at'))}) as b, outcome::text as outcome, count(*) as count
      from calls
      where started_at >= ${w.start} and ${callSite(site)}
      group by 1, 2
    )
    select ${b.label} as label, ${b.full} as "full", c.outcome, coalesce(c.count, 0) as count
    from ${b.series} as b
    left join c using (b)
    order by b
  `);
  return stack(data, 'outcome', CALL_OUTCOMES.map((c) => c.key));
}

/** Long rows (bucket × key × count) to one point per bucket, keeping bucket order. */
function stack<K extends string, F extends string>(
  data: Array<{ label: string; full: string; count: string } & { [P in F]: K | null }>,
  field: F,
  keys: readonly K[],
): StackPoint<K>[] {
  const points = new Map<string, StackPoint<K>>();
  for (const r of data) {
    let point = points.get(r.full);
    if (!point) {
      point = { label: r.label, full: r.full, values: Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number> };
      points.set(r.full, point);
    }
    const key = r[field];
    if (key) point.values[key] = n(r.count);
  }
  return [...points.values()];
}

// ── Breakdowns ──────────────────────────────────────────────────────────

export interface SiteRow {
  site: string;
  visitors: number;
  views: number;
  callTaps: number;
  formStarts: number;
  chats: number;
  aiCalls: number;
  leads: number;
}

/** One row per site, zeros included, so a quiet city still shows. */
export async function getSiteBreakdown(days: number): Promise<SiteRow[]> {
  const w = period(days);
  const [events, leads, calls] = await Promise.all([
    rows<Record<string, string>>(sql`
      select site,
        count(distinct visitor_hash) filter (where type = 'view') as visitors,
        count(*) filter (where type = 'view') as views,
        count(*) filter (where type = 'call') as calls,
        count(*) filter (where type = 'form_start') as form_starts,
        count(*) filter (where type = 'chat') as chats
      from site_events where created_at >= ${w.start}
      group by site
    `),
    rows<{ site: string; count: string }>(sql`
      select coalesce(site, 'mayells') as site, count(*) as count
      from ${leadsSince(w.start)}
      where channel <> 'manual'
      group by 1
    `),
    rows<{ site: string; count: string }>(sql`
      select coalesce(site, 'mayells') as site, count(*) as count
      from calls where started_at >= ${w.start}
      group by 1
    `),
  ]);
  const ev = new Map(events.map((r) => [r.site, r]));
  const ld = new Map(leads.map((r) => [r.site, n(r.count)]));
  const cl = new Map(calls.map((r) => [r.site, n(r.count)]));
  return ['mayells', ...MICROSITES.map((m) => m.slug)].map((s) => {
    const e = ev.get(s);
    return {
      site: s,
      visitors: n(e?.visitors),
      views: n(e?.views),
      callTaps: n(e?.calls),
      formStarts: n(e?.form_starts),
      chats: n(e?.chats),
      aiCalls: cl.get(s) ?? 0,
      leads: ld.get(s) ?? 0,
    };
  });
}

export interface RankedRow {
  label: string;
  detail?: string;
  href?: string;
  value: number;
  secondary?: number;
}

const PAGE_NAMES: Record<string, string> = {
  '/': 'Home',
  '/auctions': 'Auctions',
  '/lots': 'All lots',
  '/gallery': 'Gallery',
  '/consign': 'Consign',
  '/about': 'About',
  '/how-to-buy': 'How to buy',
  '/search': 'Search',
  '/login': 'Sign in',
  '/signup': 'Create account',
  '/forgot-password': 'Forgot password',
  '/reset-password': 'Reset password',
  '/my-bids': 'My bids',
  '/watchlist': 'Watchlist',
  '/invoices': 'My invoices',
  '/privacy': 'Privacy',
  '/terms': 'Terms',
  '/unsubscribe': 'Unsubscribe',
  '/consignment-agreement': 'Consignment agreement',
  '/upload/[token]': 'Seller photo upload',
  '/invoices/[token]': 'Invoice (emailed link)',
  '/appraisal-report/[token]': 'Appraisal report',
  '/consignor/[token]': 'Consignor portal',
};

const LOT_PATH = /^\/(?:lots|gallery)\/([^/]+)$|^\/auctions\/[^/]+\/lots\/([^/]+)$/;
const AUCTION_PATH = /^\/(?:auctions|live)\/([^/]+)$/;
const CATEGORY_PATH = /^\/categories\/([^/]+)$/;

type PageKind = 'lot' | 'auction' | 'category';

function matchPage(path: string): { kind: PageKind; key: string } | null {
  const lot = LOT_PATH.exec(path);
  if (lot) return { kind: 'lot', key: decodeSafe(lot[1] ?? lot[2]) };
  const auction = AUCTION_PATH.exec(path);
  if (auction) return { kind: 'auction', key: decodeSafe(auction[1]) };
  const category = CATEGORY_PATH.exec(path);
  if (category) return { kind: 'category', key: decodeSafe(category[1]) };
  return null;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Names pages by what is on them (a lot's title, a sale's, a department's)
 * with one lookup per table for the whole list.
 */
async function pageNamer(pages: Array<{ site: string; path: string | null }>): Promise<(site: string, path: string | null) => string> {
  const keys: Record<PageKind, Set<string>> = { lot: new Set(), auction: new Set(), category: new Set() };
  for (const p of pages) {
    const match = p.site === 'mayells' && p.path ? matchPage(p.path) : null;
    if (match) keys[match.kind].add(match.key);
  }
  const [lot, auction, category] = await Promise.all([
    namesFor(keys.lot, sql.raw('lots'), sql.raw('title'), true),
    namesFor(keys.auction, sql.raw('auctions'), sql.raw('title'), true),
    namesFor(keys.category, sql.raw('categories'), sql.raw('name'), false),
  ]);
  const names: Record<PageKind, Map<string, string>> = { lot, auction, category };
  const fallback: Record<PageKind, string> = { lot: 'Lot', auction: 'Sale', category: 'Department' };

  return (site, path) => {
    if (site !== 'mayells') return !path || path === '/' ? `${siteName(site)} city site` : `${siteDomain(site)}${path}`;
    if (!path) return 'mayells.com';
    if (PAGE_NAMES[path]) return PAGE_NAMES[path];
    const match = matchPage(path);
    return match ? (names[match.kind].get(match.key) ?? fallback[match.kind]) : path;
  };
}

/** Most-viewed pages, named by what is on them. */
export async function getTopPages(days: number, site: SiteFilter, limit = 12): Promise<RankedRow[]> {
  const w = period(days);
  const data = await rows<{ site: string; path: string; views: string; visitors: string }>(sql`
    select site, path, count(*) as views, count(distinct visitor_hash) as visitors
    from site_events
    where type = 'view' and created_at >= ${w.start} and ${eventSite(site)} and path is not null
    group by site, path
    order by views desc, visitors desc
    limit ${limit}
  `);
  const name = await pageNamer(data);

  return data.map((r) => {
    const domain = siteDomain(r.site);
    return {
      label: name(r.site, r.path),
      detail: r.site !== 'mayells' ? `${domain}${r.path === '/' ? '' : r.path}` : r.path,
      href: r.path.includes('[token]') ? undefined : `https://${domain}${r.path}`,
      value: n(r.views),
      secondary: n(r.visitors),
    };
  });
}

/** Display names for ids or slugs found in paths. */
async function namesFor(keys: Set<string>, table: SQL, nameCol: SQL, byIdToo: boolean): Promise<Map<string, string>> {
  if (keys.size === 0) return new Map();
  const list = [...keys];
  const data = await rows<{ id: string; slug: string | null; name: string }>(sql`
    select id::text as id, slug, ${nameCol} as name from ${table}
    where slug in (${sql.join(list.map((k) => sql`${k}`), sql`, `)})
    ${byIdToo ? sql`or id::text in (${sql.join(list.map((k) => sql`${k}`), sql`, `)})` : sql``}
  `);
  const map = new Map<string, string>();
  for (const r of data) {
    map.set(r.id, r.name);
    if (r.slug) map.set(r.slug, r.name);
  }
  return map;
}

/** Where visits came from, by visits (utm_source when tagged, else the referring site). */
export async function getSources(days: number, site: SiteFilter, limit = 10): Promise<RankedRow[]> {
  const w = period(days);
  const data = await rows<{ utm_source: string | null; referrer_host: string | null; visits: string }>(sql`
    select utm_source, referrer_host, count(*) as visits
    from site_events
    where entry and created_at >= ${w.start} and ${eventSite(site)}
    group by 1, 2
  `);
  const merged = new Map<string, number>();
  for (const r of data) {
    const label = sourceLabel(r.utm_source, r.referrer_host);
    merged.set(label, (merged.get(label) ?? 0) + n(r.visits));
  }
  return [...merged.entries()]
    .map(([label, value]) => ({ label, value, detail: label === DIRECT_SOURCE ? 'Typed the address, a bookmark, or an app that hides where it came from' : undefined }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Where visitors are, by visits, from Vercel's IP geolocation. */
export async function getLocations(days: number, site: SiteFilter, limit = 10): Promise<RankedRow[]> {
  const w = period(days);
  const data = await rows<{ city: string | null; region: string | null; country: string | null; visits: string }>(sql`
    select city, region, country, count(*) as visits
    from site_events
    where entry and created_at >= ${w.start} and ${eventSite(site)}
    group by 1, 2, 3
    order by visits desc
    limit ${limit}
  `);
  return data.map((r) => ({ label: placeName(r), value: n(r.visits) }));
}

export function placeName(r: { city: string | null; region: string | null; country: string | null }): string {
  if (!r.country) return 'Unknown';
  if (r.country === 'US') return [r.city, r.region].filter(Boolean).join(', ') || 'United States';
  return [r.city, r.country].filter(Boolean).join(', ');
}

export async function getDevices(days: number, site: SiteFilter): Promise<RankedRow[]> {
  const w = period(days);
  const data = await rows<{ device: string | null; visitors: string }>(sql`
    select device, count(distinct visitor_hash) as visitors
    from site_events
    where type = 'view' and created_at >= ${w.start} and ${eventSite(site)}
    group by 1
    order by visitors desc
  `);
  const names: Record<string, string> = { mobile: 'Phone', desktop: 'Computer', tablet: 'Tablet' };
  return data.map((r) => ({ label: names[r.device ?? ''] ?? 'Unknown', value: n(r.visitors) }));
}

// ── Live and recent ─────────────────────────────────────────────────────

export interface LiveView {
  at: Date;
  site: string;
  /** What the page is, e.g. a lot's title. */
  label: string;
  device: string | null;
  place: string;
  source: string | null;
}

export async function getLive(site: SiteFilter): Promise<{ activeVisitors: number; recent: LiveView[] }> {
  const [[active], recent] = await Promise.all([
    rows<{ count: string }>(sql`
      select count(distinct visitor_hash) as count from site_events
      where created_at >= ${NOW} - interval '30 minutes' and ${eventSite(site)}
    `),
    rows<{
      at_ms: string; site: string; path: string | null; device: string | null; entry: boolean;
      city: string | null; region: string | null; country: string | null;
      utm_source: string | null; referrer_host: string | null;
    }>(sql`
      select (extract(epoch from created_at) * 1000)::bigint as at_ms, site, path, device, entry, city, region, country, utm_source, referrer_host
      from site_events
      where type = 'view' and created_at >= ${NOW} - interval '1 day' and ${eventSite(site)}
      order by created_at desc
      limit 12
    `),
  ]);
  const name = await pageNamer(recent);
  return {
    activeVisitors: n(active?.count),
    recent: recent.map((r) => ({
      at: new Date(n(r.at_ms)),
      site: r.site,
      label: name(r.site, r.path),
      device: r.device,
      place: placeName(r),
      source: r.entry ? sourceLabel(r.utm_source, r.referrer_host) : null,
    })),
  };
}

export interface RecentLead {
  id: string;
  fullName: string;
  site: string | null;
  status: string;
  channel: LeadChannel;
  createdAt: Date;
}

export async function getRecentLeads(site: SiteFilter, limit = 8): Promise<RecentLead[]> {
  const data = await rows<{ id: string; full_name: string; site: string | null; status: string; channel: LeadChannel; at_ms: string }>(sql`
    select id, full_name, site, status, channel, (extract(epoch from created_at) * 1000)::bigint as at_ms
    from ${leadsSince(sql`'-infinity'::timestamp`)}
    where ${leadSite(site)}
    order by created_at desc
    limit ${limit}
  `);
  return data.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    site: r.site,
    status: r.status,
    channel: r.channel,
    createdAt: new Date(n(r.at_ms)),
  }));
}

export interface RecentCall {
  id: string;
  site: string | null;
  outcome: CallOutcome;
  durationSeconds: number | null;
  startedAt: Date;
  prospectId: string | null;
  prospectName: string | null;
  summary: string | null;
}

export async function getRecentCalls(site: SiteFilter, limit = 6): Promise<RecentCall[]> {
  const data = await rows<{
    id: string; site: string | null; outcome: CallOutcome; duration_seconds: number | null;
    at_ms: string; prospect_id: string | null; full_name: string | null; summary: string | null;
  }>(sql`
    select c.id, c.site, c.outcome::text as outcome, c.duration_seconds, (extract(epoch from c.started_at) * 1000)::bigint as at_ms,
      c.prospect_id, p.full_name, c.summary
    from (select * from calls where ${callSite(site)}) c
    left join seller_prospects p on p.id = c.prospect_id
    order by c.started_at desc
    limit ${limit}
  `);
  return data.map((r) => ({
    id: r.id,
    site: r.site,
    outcome: r.outcome,
    durationSeconds: r.duration_seconds == null ? null : n(r.duration_seconds),
    startedAt: new Date(n(r.at_ms)),
    prospectId: r.prospect_id,
    prospectName: r.full_name,
    summary: r.summary,
  }));
}

/** When mayells.com traffic was first recorded, so early zeros aren't misread. */
export async function getTrackingStart(): Promise<{ main: Date | null; microsites: Date | null }> {
  const [row] = await rows<{ main: string | null; microsites: string | null }>(sql`
    select
      (select (extract(epoch from min(created_at)) * 1000)::bigint from site_events where site = 'mayells') as main,
      (select (extract(epoch from min(created_at)) * 1000)::bigint from site_events where site <> 'mayells') as microsites
  `);
  const parse = (v: string | null | undefined) => (v ? new Date(n(v)) : null);
  return { main: parse(row?.main), microsites: parse(row?.microsites) };
}
