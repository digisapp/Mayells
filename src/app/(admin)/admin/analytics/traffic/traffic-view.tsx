import Link from 'next/link';
import { ArrowRight, Monitor, Smartphone, Tablet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { LEAD_CHANNELS, CALL_OUTCOMES } from '@/lib/analytics/channels';
import {
  SITE_OPTIONS,
  TRAFFIC_RANGES,
  getCallSeries,
  getDevices,
  getLeadSeries,
  getLive,
  getLocations,
  getRecentCalls,
  getRecentLeads,
  getSiteBreakdown,
  getSources,
  getTopPages,
  getTrackingStart,
  getTrafficSeries,
  getTrafficSummary,
  parseSiteFilter,
  parseTrafficRange,
  siteDomain,
  siteName,
  type Pair,
} from '@/lib/admin/traffic-stats';
import { AutoRefresh } from './auto-refresh';
import { BarList, Funnel, StatTile } from './blocks';
import { LineChart } from './line-chart';
import { StackedColumns } from './stacked-columns';

const statusLabels: Record<string, string> = {
  new: 'New lead',
  contacted: 'Contacted',
  upload_sent: 'Upload link sent',
  items_received: 'Items received',
  under_review: 'Under review',
  agreement_sent: 'Agreement sent',
  agreement_signed: 'Agreement signed',
  accepted: 'Accepted',
  declined: 'Declined',
  archived: 'Archived',
};

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });
const dayOnly = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });

function ago(date: Date, now: number): string {
  const minutes = Math.floor((now - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return dayOnly.format(date);
}

function duration(seconds: number | null): string {
  if (seconds === null) return '—';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function pct(num: number, den: number): string {
  if (den === 0) return '—';
  const share = num / den;
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
}

const fmt = (v: number) => v.toLocaleString();

function href(range: string, site: string): string {
  const params = new URLSearchParams();
  if (range !== '7d') params.set('range', range);
  if (site !== 'all') params.set('site', site);
  const qs = params.toString();
  return qs ? `/admin/analytics?${qs}` : '/admin/analytics';
}

function Segmented({ label, items }: { label: string; items: Array<{ key: string; label: string; href: string; current: boolean }> }) {
  return (
    <div className="inline-flex flex-wrap rounded-md border bg-muted/40 p-0.5" role="group" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.current ? 'page' : undefined}
          className={cn(
            'rounded px-3 py-1 text-xs font-medium transition-colors',
            item.current ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

const DEVICE_ICONS: Record<string, typeof Smartphone> = { mobile: Smartphone, tablet: Tablet, desktop: Monitor };
const DEVICE_COLORS: Record<string, string> = { Phone: '#2a78d6', Computer: '#eb6834', Tablet: '#1baf7a' };

export async function TrafficView({ rangeParam, siteParam }: { rangeParam?: string; siteParam?: string }) {
  const range = parseTrafficRange(rangeParam);
  const site = parseSiteFilter(siteParam);
  const days = range.days;
  const unit = days === 1 ? 'hour' : 'day';

  const [summary, series, leadSeries, callSeries, sites, pages, sources, locations, devices, live, recentLeads, recentCalls, tracking] =
    await Promise.all([
      getTrafficSummary(days, site),
      getTrafficSeries(days, site),
      getLeadSeries(days, site),
      getCallSeries(days, site),
      site === 'all' ? getSiteBreakdown(days) : Promise.resolve(null),
      getTopPages(days, site),
      getSources(days, site),
      getLocations(days, site),
      getDevices(days, site),
      getLive(site),
      getRecentLeads(site),
      getRecentCalls(site),
      getTrackingStart(),
    ]);
  // Server component renders once per request, so this is the time the
  // numbers were read; "3 min ago" and the Live stamp are relative to it.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  // Browser-reported numbers only compare fairly once tracking covers the
  // earlier period too; leads, calls and sign-ups have full history.
  const trackingStart = site === 'all' || site === 'mayells' ? tracking.main : tracking.microsites;
  const comparable = trackingStart !== null && trackingStart.getTime() <= now - 2 * days * 86_400_000;
  const traffic = (p: Pair) => (comparable ? p : undefined);

  const onlineLeads = summary.leads.current - summary.leadsByChannel.manual;
  const visits = summary.visits.current;
  const s = summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Time range"
          items={TRAFFIC_RANGES.map((r) => ({ key: r.value, label: r.label, href: href(r.value, site), current: r.value === range.value }))}
        />
        <Segmented
          label="Site"
          items={SITE_OPTIONS.map((o) => ({ key: o.value, label: o.label, href: href(range.value, o.value), current: o.value === site }))}
        />
        <span className="ml-auto">
          <AutoRefresh renderedAt={now} />
        </span>
      </div>

      {(!tracking.main || tracking.main.getTime() > now - 30 * 86_400_000) && (
        <p className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {tracking.main
            ? `Visits to mayells.com are counted from ${dateTime.format(tracking.main)}`
            : 'Visits to mayells.com are counted from the first visit after this release'}
          {tracking.microsites ? `; the city sites from ${dateTime.format(tracking.microsites)}` : ''}. Leads, calls and
          sign-ups include everything on record. Views from browsers that have opened this admin are left out.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Visitors"
          value={fmt(s.visitors.current)}
          pair={traffic(s.visitors)}
          previous={range.previous}
          sub={`${fmt(visits)} visits · ${visits ? (s.views.current / visits).toFixed(1) : '—'} pages per visit`}
          hint="People, counted once per day: someone who comes back on another day counts again."
        />
        <StatTile
          label="Page views"
          value={fmt(s.views.current)}
          pair={traffic(s.views)}
          previous={range.previous}
          sub={site === 'all' ? 'mayells.com and the four city sites' : `on ${siteDomain(site)}`}
        />
        <StatTile
          label="Leads"
          value={fmt(s.leads.current)}
          pair={s.leads}
          previous={range.previous}
          sub={s.leadsByChannel.manual ? `${fmt(onlineLeads)} online · ${fmt(s.leadsByChannel.manual)} added by staff` : 'New prospects from every channel'}
          hint="New prospects created in the period, from forms, chat, the AI phone line and staff entry. A repeat caller is added to their existing prospect, not counted again."
        />
        <StatTile
          label="Lead rate"
          value={pct(onlineLeads, s.visitors.current)}
          previous={range.previous}
          sub="Online leads per visitor"
          hint="Leads from forms, chat and the AI phone line, divided by visitors."
        />
        <StatTile
          label="Forms submitted"
          value={fmt(s.formLeads.current)}
          pair={s.formLeads}
          previous={range.previous}
          sub={`${fmt(s.formStarts.current)} started a form`}
          hint="Appraisal and consignment requests sent from mayells.com or a city site."
        />
        <StatTile
          label="Call taps"
          value={fmt(s.callTaps.current)}
          pair={traffic(s.callTaps)}
          previous={range.previous}
          sub="Taps on a phone number"
          hint="Someone tapped a phone number on the site. Whether the call went through is not known; answered calls are counted below."
        />
        <StatTile
          label="AI calls answered"
          value={fmt(s.aiCalls.current)}
          pair={s.aiCalls}
          previous={range.previous}
          sub={`${fmt(s.aiCallOutcomes.lead)} became leads · ${fmt(s.aiCallOutcomes.transferred)} transferred`}
          hint="Calls the AI phone concierge picked up, on the main line and any city line."
        />
        <StatTile
          label="Website chats"
          value={fmt(s.chats.current)}
          pair={traffic(s.chats)}
          previous={range.previous}
          sub={`${fmt(s.chatLeads)} became leads`}
          hint="Conversations started with the website chat."
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Visitors and page views</CardTitle>
            <CardDescription>{days === 1 ? 'By hour, Eastern time' : 'By day'}</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart
              label="Visitors and page views"
              unit={unit}
              buckets={series}
              series={[
                { name: 'Visitors', color: '#2a78d6', values: series.map((p) => p.visitors) },
                { name: 'Page views', color: '#eb6834', values: series.map((p) => p.views) },
              ]}
              extras={[
                { name: 'Visits', values: series.map((p) => p.visits) },
                { name: 'Call taps', values: series.map((p) => p.callTaps) },
                { name: 'Form starts', values: series.map((p) => p.formStarts) },
                { name: 'Chats', values: series.map((p) => p.chats) },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Right now</CardTitle>
            <CardDescription>On the site in the last 30 minutes</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-5xl font-semibold">{fmt(live.activeVisitors)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{live.activeVisitors === 1 ? 'person' : 'people'}</p>
            <p className="mt-6 mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Latest page views</p>
            {live.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No page views in the last 24 hours.</p>
            ) : (
              <ul className="divide-y">
                {live.recent.slice(0, 8).map((v, i) => {
                  const Icon = DEVICE_ICONS[v.device ?? ''] ?? Monitor;
                  return (
                    <li key={i} className="flex items-start gap-2.5 py-2">
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={v.device ?? 'Unknown device'} />
                      <div className="min-w-0">
                        <p className="truncate text-sm">{v.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[ago(v.at, now), v.place !== 'Unknown' ? v.place : null, v.source ? `from ${v.source}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Leads by channel</CardTitle>
            <CardDescription>New prospects, by how they reached us</CardDescription>
          </CardHeader>
          <CardContent>
            <StackedColumns
              label="Leads by channel"
              unit={unit}
              empty="No leads in this period yet."
              buckets={leadSeries}
              series={LEAD_CHANNELS.map((c) => ({ name: c.label, color: c.color, values: leadSeries.map((p) => p.values[c.key]) }))}
            />
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
              {LEAD_CHANNELS.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c.color }} aria-hidden />
                    {c.label}
                  </span>
                  <span className="font-medium tabular-nums">{fmt(s.leadsByChannel[c.key])}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>From visit to lead</CardTitle>
            <CardDescription>Each step as a share of the one before</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Funnel
              title="Forms"
              steps={[
                { label: 'Visitors', value: s.visitors.current },
                { label: 'Started a form', value: s.formStarts.current },
                { label: 'Submitted a form', value: s.formLeads.current },
              ]}
            />
            <Funnel
              title="Phone"
              note="Not one path: people also dial from print, search results and computers."
              steps={[
                { label: 'Tapped a number', value: s.callTaps.current },
                { label: 'AI answered', value: s.aiCalls.current },
                { label: 'Became a lead', value: s.aiCallOutcomes.lead },
              ]}
            />
            <Funnel
              title="Chat"
              steps={[
                { label: 'Started a chat', value: s.chats.current },
                { label: 'Became a lead', value: s.chatLeads },
              ]}
            />
            {s.signups && (
              <p className="border-t pt-4 text-sm text-muted-foreground">
                Also: <span className="font-medium text-foreground">{fmt(s.signups.newsletter.current)}</span> newsletter
                sign-ups and <span className="font-medium text-foreground">{fmt(s.signups.accounts.current)}</span> new
                accounts.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {sites && (
        <Card>
          <CardHeader>
            <CardTitle>By site</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {['Site', 'Visitors', 'Page views', 'Call taps', 'Form starts', 'Chats', 'AI calls', 'Leads', 'Lead rate'].map((h, i) => (
                    <TableHead key={h} className={cn('text-xs uppercase tracking-wider text-muted-foreground', i > 0 && 'text-right')}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((r) => (
                  <TableRow key={r.site}>
                    <TableCell>
                      <Link href={href(range.value, r.site)} className="font-medium hover:underline">
                        {siteName(r.site)}
                      </Link>
                      {r.site !== 'mayells' && <p className="text-xs text-muted-foreground">{siteDomain(r.site)}</p>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.visitors)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.views)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.callTaps)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.formStarts)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.chats)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.aiCalls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.leads)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.leads, r.visitors)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Leads here are online leads (forms, chat, AI phone line); the main phone line counts toward mayells.com.
              Staff-entered prospects have no site.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Top pages</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={pages} columns={['Page', 'Views', 'visitors']} empty="No page views in this period yet." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Where visits came from</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={sources} columns={['Source', 'Visits']} empty="No visits in this period yet." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Where visitors are</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={locations} columns={['Place', 'Visits']} empty="No visits in this period yet." />
            {devices.length > 0 && <DeviceSplit rows={devices} />}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>AI phone line</CardTitle>
                <CardDescription className="mt-1.5">
                  {fmt(s.aiCalls.current)} answered · average {duration(s.aiCallAvgSeconds)}
                </CardDescription>
              </div>
              <Link href="/admin/calls" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                All calls <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <StackedColumns
              label="AI-answered calls by outcome"
              unit={unit}
              height={170}
              empty="No calls answered in this period."
              buckets={callSeries}
              series={CALL_OUTCOMES.map((o) => ({ name: o.label, color: o.color, values: callSeries.map((p) => p.values[o.key]) }))}
            />
            {recentCalls.length > 0 && (
              <ul className="mt-4 divide-y border-t">
                {recentCalls.map((c) => {
                  const outcome = CALL_OUTCOMES.find((o) => o.key === c.outcome);
                  return (
                    <li key={c.id} className="py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: outcome?.color }} aria-hidden />
                          <span className="truncate">
                            {outcome?.label}
                            {c.prospectId && c.prospectName && (
                              <>
                                {' · '}
                                <Link href={`/admin/prospects/${c.prospectId}`} className="font-medium hover:underline">
                                  {c.prospectName}
                                </Link>
                              </>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {c.site ? `${siteName(c.site)} line` : 'Main line'} · {duration(c.durationSeconds)} · {ago(c.startedAt, now)}
                        </span>
                      </div>
                      {c.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.summary}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle>Latest leads</CardTitle>
              <Link href="/admin/prospects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                All prospects <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leads yet.</p>
            ) : (
              <ul className="divide-y">
                {recentLeads.map((l) => {
                  const channel = LEAD_CHANNELS.find((c) => c.key === l.channel);
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/admin/prospects/${l.id}`} className="block truncate text-sm font-medium hover:underline">
                          {l.fullName}
                        </Link>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: channel?.color }} aria-hidden />
                          {channel?.label}
                          {l.site && ` · ${siteName(l.site)}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <p>{statusLabels[l.status] ?? l.status}</p>
                        <p className="text-muted-foreground">{ago(l.createdAt, now)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="max-w-3xl text-xs text-muted-foreground">
        Visitors are counted once per person per day and never stored by IP address. Bots, link previews and browsers
        that have opened this admin are left out; add <code>?notrack</code> to a city-site address to leave out a
        phone or computer there too. Leads, forms and AI calls come from the prospect and call records, so they are
        complete even when a visitor&apos;s browser blocks tracking.
      </p>
    </div>
  );
}

function DeviceSplit({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  // Fixed per device, so a device keeps its colour when the ranking changes.
  const color = (label: string) => DEVICE_COLORS[label] ?? '#eda100';
  return (
    <div className="mt-6 border-t pt-4">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Devices</p>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {rows.map((r) => (
          <div key={r.label} style={{ width: `${(r.value / Math.max(1, total)) * 100}%`, background: color(r.label) }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: color(r.label) }} aria-hidden />
            {r.label} <span className="font-medium text-foreground">{pct(r.value, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
