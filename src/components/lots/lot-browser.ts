import type { LotCardLot } from './LotCard';

/**
 * Pure filter/sort logic for the /lots browser. The page is ISR-cached, so
 * department and sort are applied on the client to the rows it already has;
 * the state lives in the URL (?dept=&sort=) so a filtered view can be shared.
 */

export type LotSort = 'newest' | 'closing' | 'estimate-desc' | 'estimate-asc';

export const DEFAULT_LOT_SORT: LotSort = 'newest';

export const LOT_SORTS: readonly { value: LotSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'closing', label: 'Closing soonest' },
  { value: 'estimate-desc', label: 'Highest estimate' },
  { value: 'estimate-asc', label: 'Lowest estimate' },
];

export interface BrowseLot extends LotCardLot {
  categoryName: string;
  categorySlug: string;
  categorySortOrder: number;
  /** Catalogue date, ms since epoch (0 when unknown). */
  createdAtMs: number;
  /** When the lot's current sale closes it, ms since epoch; null when unscheduled or already past. */
  closesAtMs: number | null;
}

export interface Department {
  slug: string;
  name: string;
  count: number;
}

export interface BrowseState {
  /** Category slug, or null for every department. */
  dept: string | null;
  sort: LotSort;
}

const SORT_VALUES = new Set<string>(LOT_SORTS.map((s) => s.value));

/** One chip per category present in the rows, in the admin's category order. */
export function deriveDepartments(lots: readonly BrowseLot[]): Department[] {
  const bySlug = new Map<string, Department & { sortOrder: number }>();
  for (const lot of lots) {
    const existing = bySlug.get(lot.categorySlug);
    if (existing) existing.count += 1;
    else bySlug.set(lot.categorySlug, { slug: lot.categorySlug, name: lot.categoryName, count: 1, sortOrder: lot.categorySortOrder });
  }
  return [...bySlug.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(({ slug, name, count }) => ({ slug, name, count }));
}

/** Reads ?dept=&sort= from a location.search string; unknown sorts fall back to newest. */
export function parseBrowseState(search: string): BrowseState {
  const params = new URLSearchParams(search);
  const dept = params.get('dept')?.trim() || null;
  const sort = params.get('sort');
  return { dept, sort: sort && SORT_VALUES.has(sort) ? (sort as LotSort) : DEFAULT_LOT_SORT };
}

/**
 * The query string for a state ('' for the default view), preserving any
 * unrelated params (e.g. utm_*) already on the URL.
 */
export function browseQuery(state: BrowseState, currentSearch = ''): string {
  const params = new URLSearchParams(currentSearch);
  if (state.dept) params.set('dept', state.dept);
  else params.delete('dept');
  if (state.sort !== DEFAULT_LOT_SORT) params.set('sort', state.sort);
  else params.delete('sort');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Missing values sort last in either direction. */
function compareNullable(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

export function applyBrowse(lots: readonly BrowseLot[], state: BrowseState): BrowseLot[] {
  const filtered = state.dept ? lots.filter((lot) => lot.categorySlug === state.dept) : [...lots];
  const newest = (a: BrowseLot, b: BrowseLot) => b.createdAtMs - a.createdAtMs;

  switch (state.sort) {
    case 'closing':
      return filtered.sort(
        (a, b) =>
          compareNullable(a.closesAtMs, b.closesAtMs, 1) ||
          compareNullable(a.lotNumber, b.lotNumber, 1) ||
          newest(a, b),
      );
    case 'estimate-desc':
      return filtered.sort(
        (a, b) => compareNullable(a.estimateHigh ?? a.estimateLow, b.estimateHigh ?? b.estimateLow, -1) || newest(a, b),
      );
    case 'estimate-asc':
      return filtered.sort(
        (a, b) => compareNullable(a.estimateLow ?? a.estimateHigh, b.estimateLow ?? b.estimateHigh, 1) || newest(a, b),
      );
    default:
      return filtered.sort(newest);
  }
}
