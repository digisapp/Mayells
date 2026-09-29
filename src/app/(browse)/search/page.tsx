'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Sparkles, SlidersHorizontal, X } from 'lucide-react';
import { LotGrid } from '@/components/lots/LotGrid';
import { SaveSearchButton } from '@/components/search/SaveSearchButton';
import { formatCurrency } from '@/types';
import type { Lot } from '@/db/schema/lots';
import type { Category } from '@/db/schema/categories';

interface SearchIntent {
  keywords: string[];
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  artist?: string;
  period?: string;
  sortBy?: string;
  /** The AI parser was unavailable; the query was matched word by word. */
  fallback?: boolean;
}

const PRICE_RANGES = [
  { label: 'Any Price', min: '', max: '' },
  { label: 'Under $1,000', min: '', max: '100000' },
  { label: '$1,000 – $5,000', min: '100000', max: '500000' },
  { label: '$5,000 – $25,000', min: '500000', max: '2500000' },
  { label: '$25,000 – $100,000', min: '2500000', max: '10000000' },
  { label: 'Over $100,000', min: '10000000', max: '' },
];

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Best Match' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];
const SORT_VALUES = SORT_OPTIONS.map((o) => o.value);
const DEFAULT_SORT = 'relevance';
// Relevance only exists where Smart Search ranks; everywhere else the
// default order is really newest first, and is labelled so.
const SORT_OPTIONS_BASIC = SORT_OPTIONS.filter((o) => o.value !== 'relevance');

// The AI endpoint rejects shorter queries; below this the keyword search answers.
const MIN_SMART_QUERY = 2;

// Both search endpoints return at most this many lots.
const RESULT_LIMIT = 48;

// The figure a card leads with: live bid, else gallery price, else estimate.
const displayPrice = (lot: Lot) => lot.currentBidAmount || lot.buyNowPrice || lot.estimateLow || 0;

/**
 * Smart Search ranks on the server by relevance; any other order the visitor
 * picks is applied here (the AI endpoint has no sort parameter).
 */
function sortLots(list: Lot[], sort: string): Lot[] {
  if (sort === 'price_asc' || sort === 'price_desc') {
    const dir = sort === 'price_asc' ? 1 : -1;
    // Unpriced lots go last in either direction.
    return [...list].sort((a, b) => {
      const pa = displayPrice(a);
      const pb = displayPrice(b);
      if (!pa || !pb) return (pa ? 0 : 1) - (pb ? 0 : 1);
      return (pa - pb) * dir;
    });
  }
  if (sort === 'newest') {
    return [...list].sort(
      (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
    );
  }
  return list;
}

type SearchError = 'rate_limited' | 'failed' | null;

const DEPARTMENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const initialSort = searchParams.get('sort') ?? '';
  // `department` is the public name; `category` kept for older links.
  // Only a department id is valid; a hand-edited slug would 400 the lots API.
  const rawDepartment = searchParams.get('department') ?? searchParams.get('category') ?? '';
  const initialDepartment = DEPARTMENT_ID_RE.test(rawDepartment) ? rawDepartment : '';

  const [query, setQuery] = useState(initialQuery);
  // As the server returned them. Smart Search results are re-sorted on the
  // client (see sortedResults); basic results arrive in the requested order.
  const [results, setResults] = useState<Lot[]>([]);
  const [clientSorted, setClientSorted] = useState(false);
  const [total, setTotal] = useState(0);
  const [intent, setIntent] = useState<SearchIntent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<SearchError>(null);
  // Smart Search refused (rate limit / outage) and keyword results stand in.
  const [aiNotice, setAiNotice] = useState<SearchError>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [useAI, setUseAI] = useState(true);
  const [showFilters, setShowFilters] = useState(!!initialDepartment);
  const [categories, setCategories] = useState<Category[]>([]);

  // Filter state
  const [categoryFilter, setCategoryFilter] = useState(initialDepartment);
  const [saleType, setSaleType] = useState('');
  const [priceRange, setPriceRange] = useState(0);
  const [sort, setSort] = useState(SORT_VALUES.includes(initialSort) ? initialSort : DEFAULT_SORT);

  const trimmedQuery = query.trim();
  const activeCat = categoryFilter && categoryFilter !== 'all' ? categoryFilter : '';
  const activeSale = saleType && saleType !== 'all' ? saleType : '';
  const hasActiveFilters = !!activeCat || !!activeSale || priceRange > 0;
  const activeFilterCount = [activeCat, activeSale, priceRange > 0].filter(Boolean).length;
  // Smart Search runs only for a real query with no filters; everything else
  // is the keyword search.
  const smartPath = useAI && trimmedQuery.length >= MIN_SMART_QUERY && !hasActiveFilters;
  // The order the keyword search asks the server for. Null on the Smart
  // Search path, whose results are sorted here — so changing the sort there
  // never re-asks the model (cost, rate limit).
  const fetchSort = smartPath ? null : sort === 'relevance' ? 'newest' : sort;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/categories', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setCategories(d.data || []))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Keep q / sort / department in the address bar so refresh, back and a
  // shared link all return to the same results. The native History API is
  // synced with useSearchParams and, unlike router.replace, doesn't refetch
  // the route on every debounced keystroke.
  const syncUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const set = (key: string, value: string) => (value ? params.set(key, value) : params.delete(key));
    set('q', trimmedQuery);
    set('sort', sort !== DEFAULT_SORT ? sort : '');
    set('department', categoryFilter && categoryFilter !== 'all' ? categoryFilter : '');
    params.delete('category');
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, '', next);
    }
  }, [trimmedQuery, sort, categoryFilter]);

  // The address bar follows the search, debounced like the search itself
  // (Safari throttles rapid replaceState calls).
  useEffect(() => {
    const t = setTimeout(syncUrl, 400);
    return () => clearTimeout(t);
  }, [syncUrl]);

  const doSearch = useCallback(async (signal: AbortSignal) => {
    void retryNonce; // "Try again" bumps it to re-run the same search

    if (!trimmedQuery && !hasActiveFilters) {
      setResults([]);
      setTotal(0);
      setIntent(null);
      setError(null);
      setAiNotice(null);
      // An aborted in-flight search skips its own finally-reset.
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    let aiRefusal: SearchError = null;
    try {
      const range = PRICE_RANGES[priceRange];

      if (smartPath) {
        const res = await fetch(`/api/ai/search?q=${encodeURIComponent(trimmedQuery)}&limit=${RESULT_LIMIT}`, { signal });
        const data = res.ok ? await res.json().catch(() => null) : null;
        if (signal.aborted) return;
        if (data) {
          const list: Lot[] = data.data || [];
          setResults(list);
          setClientSorted(true);
          setTotal(list.length);
          setIntent(data.intent || null);
          setAiNotice(null);
          return;
        }
        // Only a refusal (rate limit, outage) earns a notice; any other
        // answer falls through to the keyword search below quietly.
        aiRefusal = res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'failed' : null;
      }

      // Basic search with filters (relevance only exists in Smart Search).
      const params = new URLSearchParams();
      if (trimmedQuery) params.set('q', trimmedQuery);
      if (activeCat) params.set('category', activeCat);
      if (activeSale) params.set('saleType', activeSale);
      if (range.min) params.set('minPrice', range.min);
      if (range.max) params.set('maxPrice', range.max);
      params.set('sort', fetchSort ?? 'newest');
      params.set('limit', String(RESULT_LIMIT));

      const res = await fetch(`/api/lots?${params}`, { signal });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (signal.aborted) return;
      setResults(data.data || []);
      // Standing in for Smart Search, the visitor's sort is applied here too.
      setClientSorted(smartPath);
      setTotal(data.total || 0);
      setIntent(null);
      setAiNotice(aiRefusal);
    } catch {
      // A newer search superseded this one — leave its results alone
      if (signal.aborted) return;
      setResults([]);
      setTotal(0);
      setIntent(null);
      setAiNotice(null);
      setError(aiRefusal === 'rate_limited' ? 'rate_limited' : 'failed');
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [trimmedQuery, activeCat, activeSale, hasActiveFilters, priceRange, smartPath, fetchSort, retryNonce]);

  const inputRef = useRef<HTMLInputElement>(null);
  // Starts the pending debounced search immediately (Return / the keyboard's
  // Search key). A no-op once that search has already started, so submitting
  // never issues a duplicate (AI) request.
  const flushSearchRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      void doSearch(controller.signal);
    };
    const timeout = setTimeout(run, 400);
    flushSearchRef.current = run;
    return () => {
      clearTimeout(timeout);
      controller.abort();
      flushSearchRef.current = null;
    };
  }, [doSearch]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    flushSearchRef.current?.();
    // Dismiss the iPhone keyboard so the results are visible.
    inputRef.current?.blur();
  }

  // Smart Search results are only labelled as such when the model answered.
  const smartAnswered = !!intent && !intent.fallback;
  const capped = results.length >= RESULT_LIMIT && total >= results.length;
  const sortedResults = useMemo(
    () => (clientSorted ? sortLots(results, sort) : results),
    [results, clientSorted, sort],
  );
  // "Best Match" is offered only where it is true; elsewhere the default
  // order shows as what it is, "Newest".
  const relevanceAvailable = smartPath && !aiNotice;
  const sortOptions = relevanceAvailable ? SORT_OPTIONS : SORT_OPTIONS_BASIC;
  const shownSort = !relevanceAvailable && sort === 'relevance' ? 'newest' : sort;

  function clearFilters() {
    setCategoryFilter('');
    setSaleType('');
    setPriceRange(0);
    setSort(DEFAULT_SORT);
  }

  // "Refine": open the filters and put the cursor back in the search box.
  function refine() {
    setShowFilters(true);
    inputRef.current?.focus();
  }

  return (
    <>
      {/* Search bar: a real search form, so the iPhone keyboard shows a
          Search key and Return submits (and dismisses it) in either mode. */}
      <form role="search" action="/search" onSubmit={handleSubmit} className="relative max-w-xl mx-auto mb-4">
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          name="q"
          enterKeyHint="search"
          inputMode="search"
          autoComplete="off"
          // The search APIs refuse queries over 500 characters.
          maxLength={500}
          aria-label="Search the catalogue"
          placeholder={useAI ? 'Try: "art deco jewelry under $5000"' : 'Search lots, artists, makers...'}
          className="pl-12 h-12 text-base sm:text-lg md:text-lg"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="sr-only">Search</button>
      </form>

      {/* Toggle row — 44px targets until the desktop pointer layout */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
        <Button
          variant={useAI ? 'default' : 'outline'}
          size="sm"
          aria-pressed={useAI}
          onClick={() => setUseAI(true)}
          className={`h-11 lg:h-8 gap-1 ${useAI ? 'bg-champagne text-charcoal hover:bg-champagne/90' : ''}`}
        >
          <Sparkles className="h-3 w-3" /> Smart Search
        </Button>
        <Button
          variant={!useAI ? 'default' : 'outline'}
          size="sm"
          aria-pressed={!useAI}
          onClick={() => setUseAI(false)}
          className="h-11 lg:h-8"
        >
          Basic Search
        </Button>
        <div aria-hidden className="w-px h-5 bg-border mx-1" />
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          aria-expanded={showFilters}
          aria-controls="search-filters"
          onClick={() => setShowFilters(!showFilters)}
          className="h-11 lg:h-8 gap-1"
        >
          <SlidersHorizontal className="h-3 w-3" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 bg-champagne text-charcoal text-xs rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center font-bold">
              {activeFilterCount}
              <span className="sr-only"> active</span>
            </span>
          )}
        </Button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div id="search-filters" className="bg-muted/50 border rounded-lg p-4 mb-6 max-w-3xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div>
              <label htmlFor="filter-department" className="text-xs font-medium text-muted-foreground mb-1.5 block">Department</label>
              <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
                <SelectTrigger id="filter-department" className="w-full data-[size=default]:h-11 lg:data-[size=default]:h-9 text-[15px] sm:text-sm">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="filter-sale-type" className="text-xs font-medium text-muted-foreground mb-1.5 block">Sale Type</label>
              <Select value={saleType || 'all'} onValueChange={(v) => setSaleType(v === 'all' ? '' : v)}>
                <SelectTrigger id="filter-sale-type" className="w-full data-[size=default]:h-11 lg:data-[size=default]:h-9 text-[15px] sm:text-sm">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="auction">Auction</SelectItem>
                  <SelectItem value="gallery">Gallery (Fixed price)</SelectItem>
                  <SelectItem value="private">Private Sale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="filter-price" className="text-xs font-medium text-muted-foreground mb-1.5 block">Price Range</label>
              <Select value={String(priceRange)} onValueChange={(v) => setPriceRange(parseInt(v))}>
                <SelectTrigger id="filter-price" className="w-full data-[size=default]:h-11 lg:data-[size=default]:h-9 text-[15px] sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_RANGES.map((r, i) => (
                    <SelectItem key={i} value={String(i)}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="filter-sort" className="text-xs font-medium text-muted-foreground mb-1.5 block">Sort By</label>
              <Select value={shownSort} onValueChange={setSort}>
                <SelectTrigger id="filter-sort" className="w-full data-[size=default]:h-11 lg:data-[size=default]:h-9 text-[15px] sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Active:</span>
              {/* Each chip removes its filter: the whole chip is the target. */}
              {categoryFilter && categoryFilter !== 'all' && (
                <ActiveFilterChip onRemove={() => setCategoryFilter('')}>
                  {categories.find((c) => c.id === categoryFilter)?.name || 'Department'}
                </ActiveFilterChip>
              )}
              {saleType && saleType !== 'all' && (
                <ActiveFilterChip onRemove={() => setSaleType('')}>
                  <span className="capitalize">{saleType}</span>
                </ActiveFilterChip>
              )}
              {priceRange > 0 && (
                <ActiveFilterChip onRemove={() => setPriceRange(0)}>
                  {PRICE_RANGES[priceRange].label}
                </ActiveFilterChip>
              )}
              <Button variant="ghost" size="sm" className="text-[13px] h-11 lg:h-9 px-3" onClick={clearFilters}>
                Clear all
              </Button>
            </div>
          )}
        </div>
      )}

      {/* What Smart Search understood — only when the model actually parsed
          the query; a keyword fallback is shown as plain results. */}
      {smartAnswered && intent && !isLoading && (
        <div className="flex flex-wrap items-center gap-2 mb-6 justify-center">
          <span className="text-xs text-muted-foreground">Searching for:</span>
          {intent.keywords?.map((k) => <Badge key={k} variant="outline" className="text-xs">{k}</Badge>)}
          {intent.category && <Badge className="text-xs border-0 bg-champagne/15 text-champagne-deep">{intent.category}</Badge>}
          {intent.artist && <Badge className="text-xs" variant="secondary">Artist: {intent.artist}</Badge>}
          {intent.period && <Badge className="text-xs" variant="secondary">{intent.period}</Badge>}
          {intent.maxPrice && <Badge className="text-xs" variant="secondary">Under {formatCurrency(intent.maxPrice)}</Badge>}
          {intent.minPrice && <Badge className="text-xs" variant="secondary">Over {formatCurrency(intent.minPrice)}</Badge>}
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-6 h-6 border-2 border-champagne border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Searching…</p>
        </div>
      ) : error ? (
        <div role="alert" className="text-center py-12 border border-border/60 rounded-2xl px-6 max-w-xl mx-auto">
          <p className="font-display text-display-sm">
            {error === 'rate_limited' ? 'Search is busy right now' : 'Search didn’t load'}
          </p>
          <p className="text-muted-foreground mt-2">
            {error === 'rate_limited'
              ? 'You’ve run a lot of searches in a short time. Please try again in a little while, or browse the catalogue directly.'
              : 'Something went wrong on our side. Please try again, or browse the catalogue directly.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <Button variant="champagne" size="lg" onClick={() => setRetryNonce((n) => n + 1)}>
              Try again
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/lots">Browse all lots</Link>
            </Button>
          </div>
        </div>
      ) : trimmedQuery || hasActiveFilters ? (
        <>
          {aiNotice && (
            <p className="mb-4 text-center text-sm text-muted-foreground">
              {aiNotice === 'rate_limited'
                ? 'Smart Search has reached its limit for now, so these are keyword matches.'
                : 'Smart Search is unavailable right now, so these are keyword matches.'}
              {aiNotice === 'failed' && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => setRetryNonce((n) => n + 1)}
                    className="inline-flex min-h-11 items-center font-medium text-champagne-deep underline-offset-4 hover:underline lg:min-h-0"
                  >
                    Try Smart Search again
                  </button>
                </>
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-6">
            {/* Only the count is announced; the Refine button sits outside
                the live region so it isn't read out with every update. */}
            <p className="text-sm text-muted-foreground min-w-0 break-words">
              <span aria-live="polite">
                {capped
                  ? total > results.length
                    ? <>Showing {results.length} of {total} results</>
                    : <>Showing the top {results.length} results</>
                  : <>{total} result{total !== 1 ? 's' : ''}</>}
                {trimmedQuery ? <> for &ldquo;{trimmedQuery}&rdquo;</> : ''}
              </span>
              {capped && (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={refine}
                    className="inline-flex min-h-11 items-center font-medium text-champagne-deep underline-offset-4 hover:underline lg:min-h-0"
                  >
                    Refine your search
                  </button>
                </>
              )}
            </p>
            <SaveSearchButton
              key={`${trimmedQuery.toLowerCase()}|${categoryFilter}`}
              query={query}
              categoryId={activeCat || undefined}
            />
          </div>
          {results.length > 0 ? (
            <>
              <h2 className="sr-only">Results</h2>
              <LotGrid lots={sortedResults} showLotNumber={false} />
            </>
          ) : (
            <NoResults query={trimmedQuery} hasFilters={hasActiveFilters} onClearFilters={clearFilters} />
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <Sparkles className="h-8 w-8 text-champagne-deep mx-auto mb-3" />
          <p className="text-muted-foreground">Search with natural language or use filters</p>
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            {['Art Deco jewelry under $5000', 'Picasso prints', 'Mid-century furniture', 'Vintage Rolex'].map((example) => (
              <Button key={example} variant="outline" size="sm" className="h-11 lg:h-8 text-[13px]" onClick={() => setQuery(example)}>
                {example}
              </Button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Empty results: say what to try next instead of a dead end. */
function NoResults({ query, hasFilters, onClearFilters }: { query: string; hasFilters: boolean; onClearFilters: () => void }) {
  return (
    <div className="text-center py-12 sm:py-16 border border-border/60 rounded-2xl px-6">
      <p className="font-display text-display-sm">
        {query ? <>Nothing matches &ldquo;{query}&rdquo; yet</> : 'No lots match these filters'}
      </p>
      <p className="text-muted-foreground mt-2 max-w-md mx-auto">
        {hasFilters
          ? 'Try removing a filter, or use fewer or broader words.'
          : 'Try fewer or broader words, or browse the full catalogue.'}{' '}
        New pieces are catalogued regularly.
      </p>
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center mt-6">
        {hasFilters && (
          <Button variant="outline" size="lg" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
        <Button asChild variant="outline" size="lg">
          <Link href="/lots">Browse all lots</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/auctions">View auctions</Link>
        </Button>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Looking for something specific?{' '}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
          className="inline-flex min-h-11 items-center font-medium text-champagne-deep underline-offset-4 hover:underline"
        >
          Ask a specialist
        </button>
        {' '}or{' '}
        <Link href="/consign" className="inline-flex min-h-11 items-center font-medium text-champagne-deep underline-offset-4 hover:underline">
          consign a similar piece
        </Link>
        .
      </p>
    </div>
  );
}

function ActiveFilterChip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 h-11 lg:h-8 pl-3 pr-2.5 rounded-full bg-secondary text-secondary-foreground text-[13px] sm:text-xs font-medium hover:bg-secondary/80 transition-colors"
    >
      {children}
      <X aria-hidden className="h-3.5 w-3.5 opacity-70" />
      <span className="sr-only">(remove filter)</span>
    </button>
  );
}

export default function SearchPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:py-12">
      <h1 className="font-display text-display-lg text-center mb-6 sm:mb-8">Search</h1>
      <Suspense>
        <SearchContent />
      </Suspense>
    </div>
  );
}
