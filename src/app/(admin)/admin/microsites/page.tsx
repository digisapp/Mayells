export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { cn } from '@/lib/utils';
import { micrositeCity } from '@/lib/microsites/labels';
import {
  getMicrositeRows,
  getMicrositeSources,
  getRecentMicrositeLeads,
  getMicrositeTrackingStart,
} from '@/lib/admin/microsite-stats';
import { ExternalLink } from 'lucide-react';

const RANGES = [
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
] as const;

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

const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/New_York',
});

function pct(num: number, den: number) {
  if (den === 0) return '—';
  return `${((num / den) * 100).toFixed(num / den < 0.1 ? 1 : 0)}%`;
}

export default async function AdminMicrositesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdminPage();
  const { range: rangeParam } = await searchParams;
  const range = RANGES.find((r) => r.value === rangeParam) ?? RANGES[1];

  const [rows, sources, recentLeads, trackingStart] = await Promise.all([
    getMicrositeRows(range.days),
    getMicrositeSources(range.days),
    getRecentMicrositeLeads(),
    getMicrositeTrackingStart(),
  ]);

  const total = rows.reduce(
    (t, r) => ({
      views: t.views + r.views,
      visitors: t.visitors + r.visitors,
      calls: t.calls + r.calls,
      formStarts: t.formStarts + r.formStarts,
      leads: t.leads + r.leads,
    }),
    { views: 0, visitors: 0, calls: 0, formStarts: 0, leads: 0 },
  );

  const tiles = [
    { label: 'Visitors', value: total.visitors, sub: `${total.views.toLocaleString()} page views` },
    { label: 'Call taps', value: total.calls, sub: 'Taps on the phone number' },
    { label: 'Form leads', value: total.leads, sub: `${total.formStarts.toLocaleString()} started the form` },
    { label: 'Lead rate', value: pct(total.leads + total.calls, total.visitors), sub: 'Calls + leads per visitor' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-sm">City microsites</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Traffic, call taps and appraisal requests from the four city domains, {range.label.toLowerCase()}.
            {trackingStart
              ? ` Tracking since ${dateTime.format(trackingStart)}.`
              : ' No visits recorded yet; tracking starts with the first visit after this release.'}
          </p>
        </div>
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <Link
              key={r.value}
              href={r.value === '30d' ? '/admin/microsites' : `/admin/microsites?range=${r.value}`}
              aria-current={r.value === range.value ? 'page' : undefined}
              className={cn(
                'px-3 py-1 rounded text-xs font-medium transition-colors',
                r.value === range.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="py-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{t.label}</p>
              <p className="text-2xl font-semibold tabular-nums mt-1">
                {typeof t.value === 'number' ? t.value.toLocaleString() : t.value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By city</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Site</th>
                <th className="py-2 px-3 font-medium text-right">Visitors</th>
                <th className="py-2 px-3 font-medium text-right">Views</th>
                <th className="py-2 px-3 font-medium text-right">Mobile</th>
                <th className="py-2 px-3 font-medium text-right">Call taps</th>
                <th className="py-2 px-3 font-medium text-right">Form starts</th>
                <th className="py-2 px-3 font-medium text-right">Leads</th>
                <th className="py-2 pl-3 font-medium text-right">Lead rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.slug} className="border-t">
                  <td className="py-3 pr-4">
                    <p className="font-medium">{r.city}</p>
                    <a
                      href={`https://${r.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {r.domain} <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">{r.visitors.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{r.views.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">{pct(r.mobileViews, r.views)}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{r.calls.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{r.formStarts.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right tabular-nums">
                    {r.leads > 0 ? (
                      <Link href={`/admin/prospects?site=${r.slug}`} className="font-medium underline underline-offset-2">
                        {r.leads}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="py-3 pl-3 text-right tabular-nums">{pct(r.leads + r.calls, r.visitors)}</td>
                </tr>
              ))}
              <tr className="border-t font-medium">
                <td className="py-3 pr-4">All cities</td>
                <td className="py-3 px-3 text-right tabular-nums">{total.visitors.toLocaleString()}</td>
                <td className="py-3 px-3 text-right tabular-nums">{total.views.toLocaleString()}</td>
                <td className="py-3 px-3" />
                <td className="py-3 px-3 text-right tabular-nums">{total.calls.toLocaleString()}</td>
                <td className="py-3 px-3 text-right tabular-nums">{total.formStarts.toLocaleString()}</td>
                <td className="py-3 px-3 text-right tabular-nums">{total.leads.toLocaleString()}</td>
                <td className="py-3 pl-3 text-right tabular-nums">{pct(total.leads + total.calls, total.visitors)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-4 max-w-3xl">
            Visitors are counted once per person per day. A call tap means someone tapped the number; whether the call
            connected is not known. Lead rate counts call taps plus form leads against visitors.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Where visitors came from</CardTitle>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No visits in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 px-3 font-medium text-right">Visitors</th>
                    <th className="py-2 pl-3 font-medium text-right">Call taps</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.source} className="border-t">
                      <td className="py-2 pr-4 truncate max-w-[220px]">{s.source}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{s.visitors.toLocaleString()}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{s.calls.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Latest microsite leads</CardTitle>
            <Link href="/admin/prospects?site=any" className="text-xs text-muted-foreground hover:text-foreground">
              All in Prospects
            </Link>
          </CardHeader>
          <CardContent>
            {recentLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No appraisal requests from the city sites yet. They appear here and in Prospects as they arrive.
              </p>
            ) : (
              <div className="space-y-3">
                {recentLeads.map((p) => (
                  <Link key={p.id} href={`/admin/prospects/${p.id}`} className="flex items-center justify-between gap-3 group">
                    <div className="min-w-0">
                      <p className="text-sm font-medium group-hover:underline truncate">{p.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {statusLabels[p.status] ?? p.status}
                        {p.totalItems ? ` · ${p.totalItems} photos` : ''}
                        {p.createdAt ? ` · ${dateTime.format(p.createdAt)}` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">
                      {p.site ? micrositeCity(p.site) : ''}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
