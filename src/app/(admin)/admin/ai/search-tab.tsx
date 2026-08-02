'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, ImageOff } from 'lucide-react';
import { formatCurrency } from '@/types';
import { toast } from 'sonner';

interface SearchResult {
  id: string;
  title: string;
  lotNumber: number | null;
  artist: string | null;
  status: string;
  estimateLow: number | null;
  estimateHigh: number | null;
  currentBidAmount: number;
  primaryImageUrl: string | null;
}

export default function SearchTab() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [intent, setIntent] = useState<Record<string, unknown> | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (res.ok) { setResults(data.data ?? []); setIntent(data.intent); setSearched(true); }
      else toast.error(data.error);
    } catch { toast.error('Search failed'); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-champagne" /> AI-Powered Search</CardTitle>
          <CardDescription>Search with natural language. Try: &quot;art deco jewelry under $5000&quot; or &quot;Picasso prints&quot;</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input placeholder="Search lots with natural language..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="flex-1" />
            <Button onClick={handleSearch} disabled={loading} className="bg-champagne text-charcoal hover:bg-champagne/90">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
          {intent && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Parsed:</span>
              {(intent.keywords as string[])?.map((k) => <Badge key={k} variant="outline" className="text-xs">{k}</Badge>)}
              {intent.category ? <Badge className="text-xs bg-champagne/20 text-champagne">{String(intent.category)}</Badge> : null}
              {intent.artist ? <Badge className="text-xs" variant="secondary">Artist: {String(intent.artist)}</Badge> : null}
              {intent.maxPrice ? <Badge className="text-xs" variant="secondary">Max: {formatCurrency(intent.maxPrice as number)}</Badge> : null}
            </div>
          )}
        </CardContent>
      </Card>
      {searched && !loading && (
        results.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{results.length} result{results.length !== 1 ? 's' : ''} found</p>
            <div className="space-y-2">
              {results.map((lot) => (
                <Link key={lot.id} href={`/admin/lots/${lot.id}`} className="block">
                  <Card className="hover:bg-accent/5 transition-colors">
                    <CardContent className="flex items-center gap-4 py-3">
                      {lot.primaryImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={lot.primaryImageUrl}
                          alt={lot.title}
                          className="h-14 w-14 rounded-md object-cover border border-border flex-shrink-0"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <ImageOff className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{lot.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {lot.lotNumber != null && <span>Lot {lot.lotNumber}</span>}
                          {lot.lotNumber != null && lot.artist && ' · '}
                          {lot.artist}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {lot.estimateLow != null && lot.estimateHigh != null && (
                          <p className="text-sm">{formatCurrency(lot.estimateLow)} – {formatCurrency(lot.estimateHigh)}</p>
                        )}
                        <Badge variant="outline" className="text-[11px] mt-0.5">{lot.status.replace(/_/g, ' ')}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No lots matched your search.</p>
        )
      )}
    </div>
  );
}
