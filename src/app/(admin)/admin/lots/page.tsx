export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { lots, categories, users } from '@/db/schema';
import { desc, asc, eq, sql, and, ilike, isNull, type SQL } from 'drizzle-orm';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { formatCurrency } from '@/types';

const PAGE_SIZE = 50;

type LotStatus = (typeof lots.status.enumValues)[number];
type SaleType = (typeof lots.saleType.enumValues)[number];

const STATUS_CHIPS: Array<{ value: LotStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'pending_review', label: 'Needs review' },
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'for_sale', label: 'For sale' },
  { value: 'in_auction', label: 'In auction' },
  { value: 'sold', label: 'Sold' },
  { value: 'unsold', label: 'Unsold' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const SALE_TYPE_OPTIONS: Array<{ value: SaleType | ''; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'auction', label: 'Auction' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'private', label: 'Private' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'price', label: 'Price (high to low)' },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]['value'];

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  for_sale: 'bg-green-100 text-green-800',
  in_auction: 'bg-purple-100 text-purple-800',
  sold: 'bg-emerald-100 text-emerald-800',
  unsold: 'bg-red-100 text-red-800',
  withdrawn: 'bg-gray-100 text-gray-600',
};

type AuctionRef = { id: string; title: string; lotNumber: number } | null;

/**
 * The sale this lot most relevantly belongs to (live/open first, then
 * upcoming, then recently ended) — same ranking as `bestAuctionSlugSql`, but
 * returning the fields the list needs as one JSON value. The outer reference
 * is written literally as "lots"."id"; only valid in queries FROM lots.
 */
const bestAuctionSql = sql<AuctionRef>`(
  SELECT json_build_object('id', a.id, 'title', a.title, 'lotNumber', al.lot_number)
  FROM auction_lots al
  JOIN auctions a ON a.id = al.auction_id
  WHERE al.lot_id = "lots"."id"
  ORDER BY CASE a.status
    WHEN 'live' THEN 0
    WHEN 'open' THEN 0
    WHEN 'preview' THEN 1
    WHEN 'scheduled' THEN 1
    WHEN 'closing' THEN 2
    WHEN 'closed' THEN 2
    ELSE 3 END,
    a.bidding_ends_at DESC NULLS LAST
  LIMIT 1
)`;

// Native <select> styled like the shadcn Input so the filter bar works
// without client JS (this is a server component; the form submits via GET).
const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none ' +
  'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30';

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function AdminLotsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const params = await searchParams;

  // Sanitise every filter: bad values fall back to "no filter" rather than
  // reaching Postgres (a stray string against a uuid/enum column throws).
  const q = first(params.q).trim().slice(0, 200);
  const rawStatus = first(params.status);
  const status = (lots.status.enumValues as readonly string[]).includes(rawStatus) ? (rawStatus as LotStatus) : '';
  const rawSaleType = first(params.saleType);
  const saleType = (lots.saleType.enumValues as readonly string[]).includes(rawSaleType) ? (rawSaleType as SaleType) : '';
  const rawCategory = first(params.category);
  const category = UUID_RE.test(rawCategory) ? rawCategory : '';
  const rawSort = first(params.sort);
  const sort: SortKey = SORT_OPTIONS.some((s) => s.value === rawSort) ? (rawSort as SortKey) : 'newest';
  // Lots with no seller-of-record are skipped at payout time — the dashboard
  // links here with ?missingSeller=1 so they get fixed before settlement.
  const missingSeller = first(params.missingSeller) === '1';
  const pageNumber = Number(first(params.page) || '1');
  const page = Number.isFinite(pageNumber) && pageNumber >= 1 ? Math.floor(pageNumber) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  // Status is kept separate so the chip counts can ignore it: every chip then
  // shows how many lots clicking it would yield under the other filters.
  const nonStatusConditions: SQL[] = [];
  if (q) nonStatusConditions.push(ilike(lots.title, `%${q}%`));
  if (saleType) nonStatusConditions.push(eq(lots.saleType, saleType));
  if (category) nonStatusConditions.push(eq(lots.categoryId, category));
  if (missingSeller) nonStatusConditions.push(isNull(lots.sellerId));
  const chipWhere = nonStatusConditions.length > 0 ? and(...nonStatusConditions) : undefined;
  const conditions: SQL[] = status ? [...nonStatusConditions, eq(lots.status, status)] : nonStatusConditions;
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderBy = sort === 'oldest'
    ? asc(lots.createdAt)
    : sort === 'price'
      ? desc(sql`COALESCE(${lots.buyNowPrice}, ${lots.estimateHigh}, ${lots.currentBidAmount}, 0)`)
      : desc(lots.createdAt);

  const [rows, [{ total }], statusCounts, departments] = await Promise.all([
    db
      .select({
        lot: lots,
        category: categories,
        seller: { id: users.id, fullName: users.fullName, email: users.email },
        auction: bestAuctionSql,
      })
      .from(lots)
      .leftJoin(categories, eq(lots.categoryId, categories.id))
      .leftJoin(users, eq(lots.sellerId, users.id))
      .where(where)
      .orderBy(orderBy, desc(lots.id))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(lots).where(where),
    db
      .select({ status: lots.status, count: sql<number>`count(*)::int` })
      .from(lots)
      .where(chipWhere)
      .groupBy(lots.status),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder)),
  ]);

  const countByStatus = new Map(statusCounts.map((r) => [r.status as string, r.count]));
  const allCount = statusCounts.reduce((sum, r) => sum + r.count, 0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!(q || status || saleType || category || missingSeller || sort !== 'newest');

  /** Build a lots URL keeping the current filters, with overrides. Page resets unless given. */
  function hrefWith(overrides: Partial<Record<'q' | 'status' | 'saleType' | 'category' | 'sort' | 'page' | 'missingSeller', string | number>>) {
    const merged: Record<string, string | number> = { q, status, saleType, category, sort, missingSeller: missingSeller ? '1' : '', page: 1, ...overrides };
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      const str = String(value ?? '');
      if (!str) continue;
      if (key === 'sort' && str === 'newest') continue;
      if (key === 'page' && str === '1') continue;
      sp.set(key, str);
    }
    const qs = sp.toString();
    return qs ? `/admin/lots?${qs}` : '/admin/lots';
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-display-sm">Lots</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} {hasFilters ? 'matching' : 'total'}
            {hasFilters && (
              <> · <Link href="/admin/lots" className="underline underline-offset-2 hover:text-foreground">Clear filters</Link></>
            )}
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/admin/lots/new"><Plus className="h-4 w-4" /> New Lot</Link>
        </Button>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_CHIPS.map((chip) => {
          const active = chip.value === status;
          const count = chip.value === '' ? allCount : (countByStatus.get(chip.value) ?? 0);
          return (
            <Link
              key={chip.label}
              href={hrefWith({ status: chip.value })}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40',
                chip.value === 'pending_review' && !active && count > 0 && 'border-yellow-400 text-yellow-800',
              )}
            >
              {chip.label}
              <span className={cn('tabular-nums', active ? 'opacity-80' : 'opacity-70')}>{count}</span>
            </Link>
          );
        })}
        <Link
          href={hrefWith({ missingSeller: missingSeller ? '' : '1' })}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            missingSeller
              ? 'bg-amber-600 text-white border-amber-600'
              : 'bg-background text-amber-800 border-amber-300 hover:border-amber-500',
          )}
          title="Lots with no seller-of-record are skipped at payout time"
        >
          No consignor set
        </Link>
      </div>

      {/* Search / type / department / sort — a plain GET form, no client JS */}
      <form method="get" action="/admin/lots" className="flex flex-wrap items-center gap-2 mb-6">
        {status && <input type="hidden" name="status" value={status} />}
        {missingSeller && <input type="hidden" name="missingSeller" value="1" />}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input name="q" defaultValue={q} placeholder="Search titles" className="pl-9" />
        </div>
        <select name="saleType" defaultValue={saleType} className={selectClass} aria-label="Sale type">
          {SALE_TYPE_OPTIONS.map((o) => (
            <option key={o.label} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select name="category" defaultValue={category} className={cn(selectClass, 'max-w-[220px]')} aria-label="Department">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} className={selectClass} aria-label="Sort">
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">Apply</Button>
      </form>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Auction</TableHead>
              <TableHead>Seller</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Price / Estimate</TableHead>
              <TableHead>Bids</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ lot, category: dept, seller, auction }) => {
              const sellerRow = seller && seller.id ? seller : null;
              return (
                <TableRow key={lot.id}>
                  <TableCell>
                    {lot.primaryImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={lot.primaryImageUrl} alt={lot.title} className="w-10 h-10 object-cover rounded" loading="lazy" />
                    ) : (
                      <div className="w-10 h-10 bg-muted rounded" />
                    )}
                  </TableCell>
                  <TableCell className="min-w-[200px]">
                    <Link href={`/admin/lots/${lot.id}`} className="font-medium hover:underline">
                      {lot.title}
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    {auction ? (
                      <div>
                        <Link href={`/admin/auctions/${auction.id}`} className="hover:underline">{auction.title}</Link>
                        <p className="text-xs text-muted-foreground">Lot {auction.lotNumber}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    {sellerRow ? (
                      <div>
                        <p className="truncate max-w-[180px]">{sellerRow.fullName || sellerRow.email}</p>
                        {sellerRow.fullName && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{sellerRow.email}</p>}
                      </div>
                    ) : (
                      <span className="text-amber-700 text-xs font-medium" title="Settlement skips the payout for a lot with no seller">— no seller</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{dept?.name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={lot.saleType === 'auction' ? 'secondary' : 'outline'}>
                      {lot.saleType === 'gallery' ? 'Gallery' : lot.saleType === 'private' ? 'Private' : 'Auction'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[lot.status] || ''}>
                      {lot.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {lot.saleType === 'gallery' && lot.buyNowPrice
                      ? formatCurrency(lot.buyNowPrice)
                      : lot.estimateLow && lot.estimateHigh
                        ? `${formatCurrency(lot.estimateLow)} — ${formatCurrency(lot.estimateHigh)}`
                        : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{lot.bidCount > 0 ? `${lot.bidCount} (${formatCurrency(lot.currentBidAmount)})` : '—'}</TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/lots/${lot.id}`} aria-label={`Edit ${lot.title}`}><Pencil className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  {hasFilters ? 'No lots match these filters.' : 'No lots yet. Create your first lot.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm">
          <p className="text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm" className="gap-1">
                <Link href={hrefWith({ page: page - 1 })}><ChevronLeft className="h-3.5 w-3.5" /> Prev</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled className="gap-1"><ChevronLeft className="h-3.5 w-3.5" /> Prev</Button>
            )}
            {page < totalPages ? (
              <Button asChild variant="outline" size="sm" className="gap-1">
                <Link href={hrefWith({ page: page + 1 })}>Next <ChevronRight className="h-3.5 w-3.5" /></Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled className="gap-1">Next <ChevronRight className="h-3.5 w-3.5" /></Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
