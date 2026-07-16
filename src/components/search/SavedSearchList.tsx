'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SavedSearchRow {
  id: string;
  query: string;
  categoryId: string | null;
  categoryName: string | null;
  createdAt: string | null;
}

export function SavedSearchList() {
  const [rows, setRows] = useState<SavedSearchRow[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/saved-searches', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setRows(d.data || []))
      .catch(() => setRows([]));
    return () => controller.abort();
  }, []);

  async function remove(id: string) {
    setRemoving(id);
    try {
      const res = await fetch(`/api/saved-searches?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } catch {
      toast.error('Could not remove this search. Please try again.');
    } finally {
      setRemoving(null);
    }
  }

  if (rows === null) return null;

  return (
    <section className="mb-12">
      <div className="flex items-center gap-2.5 mb-4">
        <Bell className="h-4 w-4 text-champagne" />
        <h2 className="font-display text-xl">Followed Searches</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Follow a search from the{' '}
          <Link href="/search" className="text-champagne hover:underline">
            search page
          </Link>{' '}
          and we&apos;ll email you when matching items are consigned.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => {
            const label = [row.query, row.categoryName].filter(Boolean).join(' · ') || 'All items';
            const href = row.query
              ? `/search?q=${encodeURIComponent(row.query)}`
              : '/search';
            return (
              <span
                key={row.id}
                className="inline-flex items-center gap-1.5 border border-border rounded-full pl-4 pr-2 py-1.5 text-sm bg-secondary/40"
              >
                <Link href={href} className="hover:text-champagne transition-colors">
                  {label}
                </Link>
                <button
                  type="button"
                  aria-label={`Stop following "${label}"`}
                  onClick={() => remove(row.id)}
                  disabled={removing === row.id}
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  {removing === row.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </button>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
