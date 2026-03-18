'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Brain, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function CatalogTab() {
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
            {result.suggestedCategory ? <div><strong>Department:</strong> <Badge className="bg-champagne/20 text-champagne">{String(result.suggestedCategory)}</Badge></div> : null}
            <div><strong>Description:</strong><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{String(result.description ?? '')}</p></div>
            {result.tags ? <div className="flex flex-wrap gap-1">{(result.tags as string[]).map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div> : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
