'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollText, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Document {
  id: string;
  type: 'agreement' | 'settlement' | 'tax';
  title: string;
  status: string;
  createdAt: string;
  url?: string;
}

export default function DocumentsPage() {
  const { isAuthenticated } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/documents')
      .then((r) => r.json())
      .then((d) => setDocuments(d.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-display-sm">Documents</h1>
        <p className="text-muted-foreground mt-1">
          Consignment agreements, settlement statements, and tax documents.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ScrollText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-1">No documents yet</p>
            <p className="text-sm text-muted-foreground">
              When you consign items, your agreements and settlement statements will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Card key={doc.id} className="hover:border-champagne/50 transition-colors">
              <CardContent className="flex items-center gap-4 py-4">
                <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{doc.title}</p>
                  <p className="text-sm text-muted-foreground capitalize">{doc.type}</p>
                </div>
                <div className="text-right flex-shrink-0 flex items-center gap-3">
                  <p className="text-xs text-muted-foreground">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                  {doc.url && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={doc.url} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
