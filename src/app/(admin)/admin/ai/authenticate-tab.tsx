'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthenticateTab() {
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
