'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Brain, Camera, DollarSign, Search, Shield, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/types';
import { toast } from 'sonner';

export default function AdminAIPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-display-sm">AI Tools</h1>
        <p className="text-muted-foreground mt-1">AI-powered cataloging, appraisal, search, and authentication.</p>
      </div>

      <Tabs defaultValue="catalog">
        <TabsList className="mb-6">
          <TabsTrigger value="catalog" className="gap-2"><Camera className="h-4 w-4" /> Catalog</TabsTrigger>
          <TabsTrigger value="appraise" className="gap-2"><DollarSign className="h-4 w-4" /> Appraise</TabsTrigger>
          <TabsTrigger value="search" className="gap-2"><Search className="h-4 w-4" /> AI Search</TabsTrigger>
          <TabsTrigger value="authenticate" className="gap-2"><Shield className="h-4 w-4" /> Authenticate</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog"><CatalogTab /></TabsContent>
        <TabsContent value="appraise"><AppraiseTab /></TabsContent>
        <TabsContent value="search"><SearchTab /></TabsContent>
        <TabsContent value="authenticate"><AuthenticateTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function CatalogTab() {
  const [imageUrls, setImageUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function handleCatalog() {
    const urls = imageUrls.split('\n').map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) { toast.error('Enter at least one image URL'); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: urls }),
      });
      const data = await res.json();
      if (res.ok) setResult(data.data);
      else toast.error(data.error);
    } catch { toast.error('Request failed'); }
    finally { setLoading(false); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5 text-champagne" /> AI Cataloging</CardTitle>
          <CardDescription>Upload image URLs and AI will generate a complete catalog entry.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Image URLs (one per line)</Label>
            <Textarea rows={4} placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg" value={imageUrls} onChange={(e) => setImageUrls(e.target.value)} />
          </div>
          <Button onClick={handleCatalog} disabled={loading} className="bg-champagne text-charcoal hover:bg-champagne/90">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyzing...</> : <><Brain className="h-4 w-4 mr-2" />Generate Catalog Entry</>}
          </Button>
        </CardContent>
      </Card>
      {result && (
        <Card>
          <CardHeader><CardTitle>Generated Catalog</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><strong>Title:</strong> {String(result.title ?? '')}</div>
            {result.subtitle ? <div><strong>Subtitle:</strong> {String(result.subtitle)}</div> : null}
            {result.artist ? <div><strong>Artist:</strong> {String(result.artist)}</div> : null}
            {result.period ? <div><strong>Period:</strong> {String(result.period)}</div> : null}
            {result.medium ? <div><strong>Medium:</strong> {String(result.medium)}</div> : null}
            {result.origin ? <div><strong>Origin:</strong> {String(result.origin)}</div> : null}
            {result.dimensions ? <div><strong>Dimensions:</strong> {String(result.dimensions)}</div> : null}
            {result.condition ? <div><strong>Condition:</strong> <Badge variant="secondary">{String(result.condition)}</Badge></div> : null}
            {result.suggestedCategory ? <div><strong>Category:</strong> <Badge className="bg-champagne/20 text-champagne">{String(result.suggestedCategory)}</Badge></div> : null}
            <div><strong>Description:</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{String(result.description ?? '')}</p></div>
            {result.tags ? <div className="flex flex-wrap gap-1">{(result.tags as string[]).map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div> : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AppraiseTab() {
  const [imageUrls, setImageUrls] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function handleAppraise() {
    const urls = imageUrls.split('\n').map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) { toast.error('Enter at least one image URL'); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai/appraise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: urls, title, artist }),
      });
      const data = await res.json();
      if (res.ok) setResult(data.data);
      else toast.error(data.error);
    } catch { toast.error('Request failed'); }
    finally { setLoading(false); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-champagne" /> AI Appraisal</CardTitle>
          <CardDescription>Get AI-generated value estimates based on images and metadata.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Image URLs (one per line)</Label>
            <Textarea rows={3} placeholder="https://example.com/image.jpg" value={imageUrls} onChange={(e) => setImageUrls(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Title</Label><Input placeholder="Item title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-2"><Label>Artist/Maker</Label><Input placeholder="Artist name" value={artist} onChange={(e) => setArtist(e.target.value)} /></div>
          </div>
          <Button onClick={handleAppraise} disabled={loading} className="bg-champagne text-charcoal hover:bg-champagne/90">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Appraising...</> : <><DollarSign className="h-4 w-4 mr-2" />Generate Appraisal</>}
          </Button>
        </CardContent>
      </Card>
      {result && (
        <Card>
          <CardHeader><CardTitle>Appraisal Result</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-muted-foreground text-xs">Low Estimate</p>
                <p className="font-display text-2xl">{formatCurrency(result.estimateLow as number)}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-muted-foreground text-xs">High Estimate</p>
                <p className="font-display text-2xl">{formatCurrency(result.estimateHigh as number)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Confidence:</span>
              <div className="flex-1 bg-muted rounded-full h-2"><div className="bg-champagne h-2 rounded-full" style={{ width: `${(result.confidence as number) * 100}%` }} /></div>
              <span className="font-medium">{Math.round((result.confidence as number) * 100)}%</span>
            </div>
            <div><strong>Market Trend:</strong> <Badge variant="secondary">{result.marketTrend as string}</Badge></div>
            <div><strong>Recommended Reserve:</strong> {formatCurrency(result.recommendedReserve as number)}</div>
            <div><strong>Suggested Starting Bid:</strong> {formatCurrency(result.suggestedStartingBid as number)}</div>
            <div><strong>Reasoning:</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{result.reasoning as string}</p></div>
            {result.comparables ? (
              <div>
                <strong>Comparable Sales:</strong>
                <div className="mt-2 space-y-2">
                  {(result.comparables as Array<{ description: string; salePrice: number; auctionHouse?: string }>).map((c, i) => (
                    <div key={i} className="p-2 bg-muted rounded text-xs">
                      <p>{c.description}</p>
                      <p className="font-medium mt-1">{formatCurrency(c.salePrice)}{c.auctionHouse ? ` — ${c.auctionHouse}` : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SearchTab() {
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

function AuthenticateTab() {
  const [imageUrls, setImageUrls] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function handleAuth() {
    const urls = imageUrls.split('\n').map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) { toast.error('Enter at least one image URL'); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: urls, title, artist }),
      });
      const data = await res.json();
      if (res.ok) setResult(data.data);
      else toast.error(data.error);
    } catch { toast.error('Request failed'); }
    finally { setLoading(false); }
  }

  const verdictColor: Record<string, string> = {
    likely_authentic: 'bg-green-100 text-green-800',
    uncertain: 'bg-yellow-100 text-yellow-800',
    likely_inauthentic: 'bg-red-100 text-red-800',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-champagne" /> AI Authentication</CardTitle>
          <CardDescription>Preliminary visual authenticity screening. Not a replacement for physical inspection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Image URLs (one per line)</Label>
            <Textarea rows={3} placeholder="https://example.com/front.jpg&#10;https://example.com/back.jpg&#10;https://example.com/detail.jpg" value={imageUrls} onChange={(e) => setImageUrls(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Title</Label><Input placeholder="Item title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-2"><Label>Attributed to</Label><Input placeholder="Artist/maker" value={artist} onChange={(e) => setArtist(e.target.value)} /></div>
          </div>
          <Button onClick={handleAuth} disabled={loading} className="bg-champagne text-charcoal hover:bg-champagne/90">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyzing...</> : <><Shield className="h-4 w-4 mr-2" />Run Authentication</>}
          </Button>
        </CardContent>
      </Card>
      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Authentication Report</CardTitle>
              <Badge className={verdictColor[(result.verdict as string)] ?? ''}>{(result.verdict as string).replace(/_/g, ' ')}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="font-medium">{result.summary as string}</p>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Confidence:</span>
              <div className="flex-1 bg-muted rounded-full h-2"><div className="bg-champagne h-2 rounded-full" style={{ width: `${(result.confidenceScore as number) * 100}%` }} /></div>
              <span className="font-medium">{Math.round((result.confidenceScore as number) * 100)}%</span>
            </div>
            {result.analysis ? (
              <div className="space-y-2">
                {Object.entries(result.analysis as Record<string, { score: number; notes: string }>).map(([key, val]) => (
                  <div key={key} className="p-3 bg-muted rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="font-display">{val.score}/10</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{val.notes}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {(result.redFlags as string[])?.length > 0 ? (
              <div>
                <strong className="text-red-600">Red Flags:</strong>
                <ul className="list-disc list-inside mt-1 text-xs space-y-1">
                  {(result.redFlags as string[]).map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            ) : null}
            {(result.recommendations as string[])?.length > 0 ? (
              <div>
                <strong>Recommendations:</strong>
                <ul className="list-disc list-inside mt-1 text-xs space-y-1">
                  {(result.recommendations as string[]).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
