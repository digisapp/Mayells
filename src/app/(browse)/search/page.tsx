'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Sparkles } from 'lucide-react';
import { LotGrid } from '@/components/lots/LotGrid';
import { formatCurrency } from '@/types';
import type { Lot } from '@/db/schema/lots';

interface SearchIntent {
  keywords: string[];
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  artist?: string;
  period?: string;
  sortBy?: string;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Lot[]>([]);
  const [intent, setIntent] = useState<SearchIntent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useAI, setUseAI] = useState(true);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIntent(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        if (useAI) {
          const res = await fetch(`/api/ai/search?q=${encodeURIComponent(query)}&limit=24`);
          const data = await res.json();
          if (res.ok) {
            setResults(data.data || []);
            setIntent(data.intent || null);
          } else {
            // Fallback to basic search
            const fallback = await fetch(`/api/lots?q=${encodeURIComponent(query)}&limit=24`);
            const fbData = await fallback.json();
            setResults(fbData.data || []);
            setIntent(null);
          }
        } else {
          const res = await fetch(`/api/lots?q=${encodeURIComponent(query)}&limit=24`);
          const data = await res.json();
          setResults(data.data || []);
          setIntent(null);
        }
      } catch {
        setResults([]);
        setIntent(null);
      } finally {
        setIsLoading(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [query, useAI]);

  return (
    <>
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

      <div className="flex items-center justify-center gap-2 mb-8">
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
      </div>

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

      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-6 h-6 border-2 border-champagne border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">{useAI ? 'AI is searching...' : 'Searching...'}</p>
        </div>
      ) : query.trim() ? (
        <>
          <p className="text-sm text-muted-foreground mb-6">
            {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
          </p>
          <LotGrid lots={results} />
        </>
      ) : (
        <div className="text-center py-12">
          <Sparkles className="h-8 w-8 text-champagne mx-auto mb-3" />
          <p className="text-muted-foreground">Search with natural language</p>
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
