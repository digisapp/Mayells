'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Camera } from 'lucide-react';

interface SubmissionImage {
  name: string;
  url: string;
  createdAt: string;
  size?: number;
}

export default function AdminSubmissionsPage() {
  const [images, setImages] = useState<SubmissionImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/submissions')
      .then((r) => r.json())
      .then((d) => setImages(d.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="font-display text-display-sm mb-2">Consignment Photos</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Photos submitted via the consign/appraisal form.
      </p>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Camera className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No submission photos yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">{images.length} photo(s)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {images.map((img) => (
              <button
                key={img.name}
                onClick={() => setSelected(selected === img.url ? null : img.url)}
                className="relative aspect-square rounded-lg overflow-hidden bg-muted border border-border/50 hover:ring-2 ring-champagne transition-all cursor-pointer"
              >
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <p className="text-[10px] text-white truncate">
                    {new Date(img.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div
              className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
              onClick={() => setSelected(null)}
            >
              <img
                src={selected}
                alt="Full size"
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
