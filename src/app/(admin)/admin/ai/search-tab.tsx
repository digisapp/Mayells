'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/types';
import { toast } from 'sonner';

export default function SearchTab() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<unknown[]>([]);
  const [intent, setIntent] = useState<Record<string, unknown> | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (res.ok) { setResults(data.data ?? []); setIntent(data.intent); }
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
      {results.length > 0 && (
        <p className="text-sm text-muted-foreground">{results.length} results found</p>
      )}
    </div>
  );
}
