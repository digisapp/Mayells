'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Lot[]>([]);
  const [total, setTotal] = useState(0);
  const [intent, setIntent] = useState<SearchIntent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // Filter state
  const [categoryFilter, setCategoryFilter] = useState('');
  const [saleType, setSaleType] = useState('');
  const [priceRange, setPriceRange] = useState(0);
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/categories', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setCategories(d.data || []))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const doSearch = useCallback(async (signal: AbortSignal) => {
    const activeCat = categoryFilter && categoryFilter !== 'all' ? categoryFilter : '';
    const activeSale = saleType && saleType !== 'all' ? saleType : '';

    if (!query.trim() && !activeCat && !activeSale && priceRange === 0) {
      setResults([]);
      setTotal(0);
      setIntent(null);
      return;
    }

    setIsLoading(true);
    try {
      const range = PRICE_RANGES[priceRange];

      if (useAI && query.trim() && !activeCat && !activeSale && priceRange === 0) {
        const res = await fetch(`/api/ai/search?q=${encodeURIComponent(query)}&limit=48`, { signal });
        const data = await res.json();
        if (signal.aborted) return;
        if (res.ok) {
          setResults(data.data || []);
          setTotal((data.data || []).length);
          setIntent(data.intent || null);
          setIsLoading(false);
          return;
        }
      }

      // Basic search with filters
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query);
      if (activeCat) params.set('category', activeCat);
      if (activeSale) params.set('saleType', activeSale);
      if (range.min) params.set('minPrice', range.min);
      if (range.max) params.set('maxPrice', range.max);
      params.set('sort', sort);
      params.set('limit', '48');

      const res = await fetch(`/api/lots?${params}`, { signal });
      const data = await res.json();
      if (signal.aborted) return;
      setResults(data.data || []);
      setTotal(data.total || 0);
      setIntent(null);
    } catch {
      // A newer search superseded this one — leave its results alone
      if (signal.aborted) return;
      setResults([]);
      setTotal(0);
      setIntent(null);
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [query, categoryFilter, saleType, priceRange, sort, useAI]);

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
    // Mirror the query in the URL so the results can be shared or revisited.
    const params = new URLSearchParams(window.location.search);
    const q = query.trim();
    if (q) params.set('q', q);
    else params.delete('q');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }

  const hasActiveFilters = (categoryFilter && categoryFilter !== 'all') || (saleType && saleType !== 'all') || priceRange > 0;
  const activeFilterCount = [categoryFilter && categoryFilter !== 'all', saleType && saleType !== 'all', priceRange > 0].filter(Boolean).length;

  function clearFilters() {
    setCategoryFilter('');
    setSaleType('');
    setPriceRange(0);
    setSort('newest');
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
          aria-label="Search the catalogue"
          placeholder={useAI ? 'Try: "art deco jewelry under $5000"' : 'Search lots, artists, makers...'}
          className="pl-12 h-12 text-base sm:text-lg md:text-lg"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="sr-only">Search</button>
      </form>

      {/* Toggle row */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
        <Button
          variant={useAI ? 'default' : 'outline'}
          size="sm"
          aria-pressed={useAI}
          onClick={() => setUseAI(true)}
          className={`h-10 sm:h-8 gap-1 ${useAI ? 'bg-champagne text-charcoal hover:bg-champagne/90' : ''}`}
        >
          <Sparkles className="h-3 w-3" /> Smart Search
        </Button>
        <Button
          variant={!useAI ? 'default' : 'outline'}
          size="sm"
          aria-pressed={!useAI}
          onClick={() => setUseAI(false)}
          className="h-10 sm:h-8"
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
          className="h-10 sm:h-8 gap-1"
        >
          <SlidersHorizontal className="h-3 w-3" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 bg-champagne text-charcoal text-[11px] rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center font-bold">
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
                <SelectTrigger id="filter-department" className="w-full data-[size=default]:h-11 sm:data-[size=default]:h-9 text-[15px] sm:text-sm">
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
                <SelectTrigger id="filter-sale-type" className="w-full data-[size=default]:h-11 sm:data-[size=default]:h-9 text-[15px] sm:text-sm">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="auction">Auction</SelectItem>
                  <SelectItem value="gallery">Gallery (Buy Now)</SelectItem>
                  <SelectItem value="private">Private Sale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="filter-price" className="text-xs font-medium text-muted-foreground mb-1.5 block">Price Range</label>
              <Select value={String(priceRange)} onValueChange={(v) => setPriceRange(parseInt(v))}>
                <SelectTrigger id="filter-price" className="w-full data-[size=default]:h-11 sm:data-[size=default]:h-9 text-[15px] sm:text-sm">
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
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger id="filter-sort" className="w-full data-[size=default]:h-11 sm:data-[size=default]:h-9 text-[15px] sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((s) => (
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
              <Button variant="ghost" size="sm" className="text-[13px] h-10 sm:h-9 px-3" onClick={clearFilters}>
                Clear all
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Search intent display */}
      {intent && (
        <div className="flex flex-wrap items-center gap-2 mb-6 justify-center">
          <span className="text-xs text-muted-foreground">Searching for:</span>
          {intent.keywords?.map((k) => <Badge key={k} variant="outline" className="text-xs">{k}</Badge>)}
          {intent.category && <Badge className="text-xs bg-champagne/20 text-champagne">{intent.category}</Badge>}
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
          <p className="text-muted-foreground text-sm">{useAI && query.trim() ? 'Searching...' : 'Searching...'}</p>
        </div>
      ) : query.trim() || hasActiveFilters ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-6">
            <p aria-live="polite" className="text-sm text-muted-foreground min-w-0 break-words">
              {total} result{total !== 1 ? 's' : ''}
              {query.trim() ? <> for &ldquo;{query}&rdquo;</> : ''}
            </p>
            <SaveSearchButton
              key={`${query.trim().toLowerCase()}|${categoryFilter}`}
              query={query}
              categoryId={categoryFilter && categoryFilter !== 'all' ? categoryFilter : undefined}
            />
          </div>
          {results.length > 0 ? (
            <LotGrid lots={results} />
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No results found. Try adjusting your search or filters.</p>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <Sparkles className="h-8 w-8 text-champagne mx-auto mb-3" />
          <p className="text-muted-foreground">Search with natural language or use filters</p>
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            {['Art Deco jewelry under $5000', 'Picasso prints', 'Mid-century furniture', 'Vintage Rolex'].map((example) => (
              <Button key={example} variant="outline" size="sm" className="h-10 sm:h-8 text-[13px]" onClick={() => setQuery(example)}>
                {example}
              </Button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ActiveFilterChip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 h-10 sm:h-8 pl-3 pr-2.5 rounded-full bg-secondary text-secondary-foreground text-[13px] sm:text-xs font-medium hover:bg-secondary/80 transition-colors"
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
