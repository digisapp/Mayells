export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { estateVisits } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, filterChipClass, filterChipCountClass } from '@/components/admin/PageHeader';
import { Plus, ClipboardCheck, Users2 } from 'lucide-react';
import { VISIT_STATUS, VISIT_STATUS_ORDER, visitStatus, type VisitStatusKey } from '@/lib/admin/status/sales';
import { formatDayOnly } from '@/lib/format/dates';
import { formatEstimate } from '@/lib/format/estimate';
import { Pager } from '../_components/Pager';

const PAGE_SIZE = 50;

const VISIT_STATUSES = VISIT_STATUS_ORDER;
type VisitStatus = VisitStatusKey;

function hrefFor(page: number, status?: VisitStatus): string {
  const q = new URLSearchParams();
  if (status) q.set('status', status);
  if (page > 1) q.set('page', String(page));
  const qs = q.toString();
  return `/admin/appraisals${qs ? `?${qs}` : ''}`;
}

// visit_date is stored as a date-only timestamp (UTC midnight); take its UTC
// calendar day so it doesn't render a day early in the house timezone.
function formatVisitDate(d: Date | null): string {
  return d ? formatDayOnly(new Date(d).toISOString()) : '—';
}

export default async function AppraisalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { page: pageParam, status: statusParam } = await searchParams;
  const status = (VISIT_STATUSES as readonly string[]).includes(statusParam ?? '')
    ? (statusParam as VisitStatus)
    : undefined;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const where = status ? eq(estateVisits.status, status) : undefined;

  const [visits, [{ total }], counts] = await Promise.all([
    db
      .select()
      .from(estateVisits)
      .where(where)
      .orderBy(desc(estateVisits.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(estateVisits).where(where),
    db
      .select({ status: estateVisits.status, n: sql<number>`count(*)::int` })
      .from(estateVisits)
      .groupBy(estateVisits.status),
  ]);

  const byStatus: Partial<Record<VisitStatus, number>> = {};
  for (const row of counts) byStatus[row.status] = row.n;
  const allCount = counts.reduce((s, c) => s + c.n, 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div>
      <PageHeader
        title="Appraisals"
        description={`${total} ${status ? 'matching' : 'total'} · in-person estate appraisals with AI-powered analysis`}
        actions={
          <Button asChild className="bg-champagne text-charcoal hover:bg-champagne/90 gap-2">
            <Link href="/admin/appraisals/new"><Plus className="h-4 w-4" /> New appraisal</Link>
          </Button>
        }
      />

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href={hrefFor(1)}
          aria-current={!status ? 'page' : undefined}
          className={filterChipClass(!status)}
        >
          All <span className={filterChipCountClass}>{allCount}</span>
        </Link>
        {VISIT_STATUSES.map((s) => (
          <Link
            key={s}
            href={status === s ? hrefFor(1) : hrefFor(1, s)}
            aria-current={status === s ? 'page' : undefined}
            className={filterChipClass(status === s)}
          >
            {VISIT_STATUS[s].label} <span className={filterChipCountClass}>{byStatus[s] ?? 0}</span>
          </Link>
        ))}
      </div>

      {visits.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="font-display text-lg mb-2">
              {status ? `No ${VISIT_STATUS[status].label.toLowerCase()} appraisals` : 'No appraisals yet'}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {status ? 'Try another status filter.' : 'Create your first estate appraisal to get started.'}
            </p>
            {!status && (
              <Button asChild className="bg-champagne text-charcoal hover:bg-champagne/90 gap-2">
                <Link href="/admin/appraisals/new"><Plus className="h-4 w-4" /> New appraisal</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-center">Items</TableHead>
                <TableHead>Estimate</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.map((visit) => (
                <TableRow key={visit.id}>
                  <TableCell>
                    <Link
                      href={`/admin/appraisals/${visit.id}`}
                      className="font-medium hover:text-champagne transition-colors"
                    >
                      {visit.clientName}
                    </Link>
                    {visit.clientEmail && (
                      <p className="text-xs text-muted-foreground">{visit.clientEmail}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {[visit.clientCity, visit.clientState].filter(Boolean).join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatVisitDate(visit.visitDate)}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {visit.processedCount}/{visit.itemCount}
                  </TableCell>
                  <TableCell>
                    {visit.totalEstimateHigh > 0 ? formatEstimate(visit.totalEstimateLow, visit.totalEstimateHigh) : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={visitStatus(visit.status).className}>
                        {visitStatus(visit.status).label}
                      </Badge>
                      {visit.prospectId && (
                        <Link
                          href={`/admin/prospects/${visit.prospectId}`}
                          className="text-muted-foreground hover:text-foreground"
                          title="Open the prospect created from this visit"
                          aria-label="Open the prospect created from this visit"
                        >
                          <Users2 className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pager
        page={page}
        totalPages={totalPages}
        hrefFor={(n) => hrefFor(n, status)}
        summary={<>{from}–{to} of {total} · page {page} of {totalPages}</>}
      />
    </div>
  );
}
