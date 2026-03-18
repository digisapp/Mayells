'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/types';
import { toast } from 'sonner';

export default function AppraiseTab() {
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
