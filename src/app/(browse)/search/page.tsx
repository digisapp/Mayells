'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Sparkles, SlidersHorizontal, X } from 'lucide-react';
import { LotGrid } from '@/components/lots/LotGrid';
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
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.data || []));
  }, []);

  const doSearch = useCallback(async () => {
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
        const res = await fetch(`/api/ai/search?q=${encodeURIComponent(query)}&limit=48`);
        const data = await res.json();
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

      const res = await fetch(`/api/lots?${params}`);
      const data = await res.json();
      setResults(data.data || []);
      setTotal(data.total || 0);
      setIntent(null);
    } catch {
      setResults([]);
      setTotal(0);
      setIntent(null);
    } finally {
      setIsLoading(false);
    }
  }, [query, categoryFilter, saleType, priceRange, sort, useAI]);

  useEffect(() => {
    const timeout = setTimeout(doSearch, 400);
    return () => clearTimeout(timeout);
  }, [doSearch]);

  const hasActiveFilters = (categoryFilter && categoryFilter !== 'all') || (saleType && saleType !== 'all') || priceRange > 0;

  function clearFilters() {
    setCategoryFilter('');
    setSaleType('');
    setPriceRange(0);
    setSort('newest');
  }

  return (
    <>
      {/* Search bar */}
      <div className="relative max-w-xl mx-auto mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder={useAI ? 'Try: "art deco jewelry under $5000"' : 'Search lots, artists, makers...'}
          className="pl-12 h-12 text-lg"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {/* Toggle row */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <Button
          variant={useAI ? 'default' : 'outline'}
          size="sm"
          onClick={() => setUseAI(true)}
          className={useAI ? 'bg-champagne text-charcoal hover:bg-champagne/90 gap-1' : 'gap-1'}
        >
          <Sparkles className="h-3 w-3" /> AI Search
        </Button>
        <Button
          variant={!useAI ? 'default' : 'outline'}
          size="sm"
          onClick={() => setUseAI(false)}
        >
          Basic Search
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1"
        >
          <SlidersHorizontal className="h-3 w-3" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 bg-champagne text-charcoal text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {[categoryFilter && categoryFilter !== 'all', saleType && saleType !== 'all', priceRange > 0].filter(Boolean).length}
            </span>
          )}
        </Button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-muted/50 border rounded-lg p-4 mb-6 max-w-3xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
              <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sale Type</label>
              <Select value={saleType || 'all'} onValueChange={(v) => setSaleType(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9">
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
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Price Range</label>
              <Select value={String(priceRange)} onValueChange={(v) => setPriceRange(parseInt(v))}>
                <SelectTrigger className="h-9">
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
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sort By</label>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-9">
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
              {categoryFilter && categoryFilter !== 'all' && (
                <Badge variant="secondary" className="text-xs gap-1">
                  {categories.find((c) => c.id === categoryFilter)?.name || 'Category'}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setCategoryFilter('')} />
                </Badge>
              )}
              {saleType && saleType !== 'all' && (
                <Badge variant="secondary" className="text-xs gap-1 capitalize">
                  {saleType}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setSaleType('')} />
                </Badge>
              )}
              {priceRange > 0 && (
                <Badge variant="secondary" className="text-xs gap-1">
                  {PRICE_RANGES[priceRange].label}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setPriceRange(0)} />
                </Badge>
              )}
              <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={clearFilters}>
                Clear all
              </Button>
            </div>
          )}
        </div>
      )}

      {/* AI intent display */}
      {intent && (
        <div className="flex flex-wrap items-center gap-2 mb-6 justify-center">
          <span className="text-xs text-muted-foreground">AI understood:</span>
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
          <p className="text-muted-foreground text-sm">{useAI && query.trim() ? 'AI is searching...' : 'Searching...'}</p>
        </div>
      ) : query.trim() || hasActiveFilters ? (
        <>
          <p className="text-sm text-muted-foreground mb-6">
            {total} result{total !== 1 ? 's' : ''}
            {query.trim() ? <> for &ldquo;{query}&rdquo;</> : ''}
          </p>
          <LotGrid lots={results} />
          {results.length === 0 && (
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
              <Button key={example} variant="outline" size="sm" onClick={() => setQuery(example)}>
                {example}
              </Button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function SearchPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="font-display text-display-lg text-center mb-8">Search</h1>
      <Suspense>
        <SearchContent />
      </Suspense>
    </div>
  );
}
