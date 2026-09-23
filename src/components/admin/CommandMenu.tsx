'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { adminLinks } from '@/components/layout/admin-nav';
import {
  Search,
  Plus,
  CornerDownLeft,
  Brain,
  Radio,
  Webhook,
  Image,
  FileText,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  href: string;
  group: 'Search' | 'Create' | 'Go to';
}

const CREATE: Command[] = [
  { id: 'new-lot', label: 'New lot', icon: Plus, href: '/admin/lots/new', group: 'Create' },
  { id: 'new-auction', label: 'New auction', icon: Plus, href: '/admin/auctions/new', group: 'Create' },
  { id: 'new-appraisal', label: 'New appraisal', icon: Plus, href: '/admin/appraisals/new', group: 'Create' },
  { id: 'new-contact', label: 'New outreach contact', icon: Plus, href: '/admin/outreach/new', group: 'Create' },
];

const PAGES: Command[] = [
  ...adminLinks.map((l) => ({ id: l.href, label: l.label, icon: l.icon, href: l.href, group: 'Go to' as const })),
  { id: 'live', label: 'Live console', hint: 'Auctions', icon: Radio, href: '/admin/live', group: 'Go to' },
  { id: 'ai', label: 'AI assist', hint: 'Lots', icon: Brain, href: '/admin/ai', group: 'Go to' },
  { id: 'log', label: 'System log', hint: 'Settings', icon: Webhook, href: '/admin/webhooks', group: 'Go to' },
];

// Lists that read ?q= from the URL.
const SEARCHABLE: { label: string; icon: LucideIcon; path: string }[] = [
  { label: 'Lots', icon: Image, path: '/admin/lots' },
  { label: 'Prospects', icon: UserPlus, path: '/admin/prospects' },
  { label: 'Clients', icon: Users, path: '/admin/users' },
  { label: 'Invoices', icon: FileText, path: '/admin/invoices' },
];

function matches(c: Command, q: string) {
  const hay = `${c.label} ${c.hint ?? ''}`.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/**
 * ⌘K / Ctrl+K: jump to any admin page, start a new record, or search a list.
 * Rendered from the topbar so it's available on every admin page.
 */
export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...CREATE, ...PAGES];
    const search: Command[] = SEARCHABLE.map((s) => ({
      id: `search-${s.path}`,
      label: `Search ${s.label.toLowerCase()} for “${query.trim()}”`,
      icon: s.icon,
      href: `${s.path}?q=${encodeURIComponent(query.trim())}`,
      group: 'Search',
    }));
    const hits = [...PAGES, ...CREATE].filter((c) => matches(c, q));
    // Exact page matches first, then search-in-list.
    return [...hits, ...search];
  }, [query]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery('');
      setCursor(0);
    }
  }

  function run(c: Command | undefined) {
    if (!c) return;
    onOpenChange(false);
    // Some lists read their filters from the URL only on mount, so a search on
    // the page you're already on needs a real reload to take effect.
    if (c.group === 'Search' && c.href.split('?')[0] === window.location.pathname) {
      window.location.assign(c.href);
      return;
    }
    router.push(c.href);
  }

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  let lastGroup: string | null = null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-2 text-muted-foreground font-normal sm:w-56 justify-start"
        aria-label="Search or jump to (Ctrl+K)"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search or jump to…</span>
        <kbd className="hidden sm:inline ml-auto text-[10px] border rounded px-1 py-px bg-muted/50">⌘K</kbd>
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="p-0 gap-0 max-w-lg overflow-hidden top-[20%] translate-y-0">
          <DialogTitle className="sr-only">Search or jump to</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, items.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  run(items[cursor]);
                }
              }}
              placeholder="Type a page, an action, or something to search…"
              className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search or jump to"
            />
          </div>
          <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5" role="listbox">
            {items.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              return (
                <div key={c.id}>
                  {header && (
                    <p className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                      {header}
                    </p>
                  )}
                  <button
                    type="button"
                    data-index={i}
                    role="option"
                    aria-selected={i === cursor}
                    onMouseMove={() => setCursor(i)}
                    onClick={() => run(c)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-md px-2 py-1.5 text-sm text-left',
                      i === cursor ? 'bg-accent/20 text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <c.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{c.label}</span>
                    {c.hint && <span className="text-xs text-muted-foreground/70">{c.hint}</span>}
                    {i === cursor && <CornerDownLeft className="h-3.5 w-3.5 ml-auto shrink-0 opacity-60" />}
                  </button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
