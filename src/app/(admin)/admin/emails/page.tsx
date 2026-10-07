'use client';

import { Suspense, useEffect } from 'react';
import {
  AlertTriangle, Archive, ArchiveRestore, Bot, ChevronLeft, ChevronRight, Inbox as InboxIcon, Keyboard,
  Mail, MailOpen, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, Star, StarOff, Trash2, X,
} from 'lucide-react';
import { PageHeader, filterChipCountClass } from '@/components/admin/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { FilterChip } from '../_components/FilterChips';
import { useAdminInbox } from '@/hooks/useAdminInbox';
import {
  AutoReplyControl, CATEGORY_LABELS, ComposeModal, EmailDetailView, EmailList, FOLDERS, InboxSetupCard,
} from '@/components/admin-inbox';

function AdminEmailsPageInner() {
  const d = useAdminInbox();

  const selectionCount = d.selectedIds.size;
  const allOnPageSelected = d.emails.length > 0 && selectionCount === d.emails.length;
  const inSpam = d.folder === 'spam';
  const inArchived = d.folder === 'archived';
  const from = d.status?.from ?? 'Mayells <info@mayells.com>';
  const categoryLabel = d.category ? (CATEGORY_LABELS[d.category] || d.category) : null;
  const showCategories = (d.folder === 'inbox' || d.folder === 'unread') && d.categories.length > 0;
  const pending = d.pendingDelete;
  const deleteTitle = !pending
    ? 'Delete?'
    : pending.threadIds.length > 0
      ? (pending.threadIds.length === 1
        ? (pending.messages > 1 ? `Delete this conversation (${pending.messages} messages)?` : 'Delete this email?')
        : `Delete ${pending.threadIds.length} conversations (${pending.messages} messages)?`)
      : (pending.ids.length > 1 ? `Delete ${pending.ids.length} emails?` : 'Delete this email?');
  const deleteDescription = pending && pending.threadIds.length > 0 && pending.messages > 1
    ? 'This permanently removes every message in the conversation from the inbox, including replies you sent. The copies in the other person\'s mailbox are not affected.'
    : 'This permanently removes the message from the inbox. Replies in the same conversation are kept and re-threaded. The copy in the other person\'s mailbox is not affected.';

  // New mail is visible from any other tab: the unread count leads the title.
  const unread = d.counts.unread;
  useEffect(() => {
    const base = 'Inbox | Mayells Admin';
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
    return () => { document.title = base; };
  }, [unread]);

  return (
    <div>
      <PageHeader
        title="Inbox"
        description={
          <>
            Mail to <span className="font-mono">{d.status?.inboundAddress ?? 'info@mayells.com'}</span> lands here; replies go out as {from}.
          </>
        }
        actions={
          <>
            <span
              className="hidden items-center gap-1 text-[11px] text-muted-foreground xl:flex"
              title="Keyboard: j/k next & previous, r reply, f forward, e archive, s star, Esc close"
            >
              <Keyboard className="h-3.5 w-3.5" />
              j/k · r · f · e · s
            </span>
            <AutoReplyControl enabled={d.autoReplyEnabled} loading={d.autoReplyLoading} from={from} onChange={d.setAutoReply} />
            <Button variant="outline" onClick={d.refresh} disabled={d.loading} aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${d.loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="champagne" onClick={d.openCompose}>
              <Plus className="h-4 w-4" />
              Compose
            </Button>
          </>
        }
      />

      {d.status && (
        <InboxSetupCard status={d.status} loading={d.statusLoading} onRecheck={d.refreshStatus} onSendTest={d.sendTest} sendingTest={d.sendingTest} />
      )}

      {/* Folders + search, then the AI categories on their own line */}
      <div className="mb-3 flex flex-col gap-2.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Folders">
            {FOLDERS.map((f) => {
              const count = f.count ? d.counts[f.count] : 0;
              return (
                <FilterChip key={f.value} active={d.folder === f.value} onClick={() => d.setFolder(f.value)}>
                  {f.label}
                  {count > 0 && <span className={filterChipCountClass}>{count}</span>}
                </FilterChip>
              );
            })}
          </div>
          <div className="relative lg:w-72 lg:shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={d.search}
            onChange={(e) => d.setSearch(e.target.value)}
            placeholder="Search name, address, subject, text…"
            aria-label="Search emails"
            className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          </div>
        </div>
        {showCategories && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by what the email is about">
            <span className="mr-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Bot className="h-3 w-3" /> About
            </span>
            {d.categories.map((c) => (
              <FilterChip
                key={c.category}
                active={d.category === c.category}
                onClick={() => d.setCategory(d.category === c.category ? null : c.category)}
                className="px-2.5 py-1"
              >
                {CATEGORY_LABELS[c.category] || c.category}
                <span className={filterChipCountClass}>{c.count}</span>
              </FilterChip>
            ))}
            {d.category && (
              <button type="button" onClick={() => d.setCategory(null)} className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {d.error && (
        <Card className="mb-3">
          <CardContent className="flex flex-wrap items-center gap-3 py-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="flex-1">{d.error}</span>
            <Button variant="outline" size="sm" onClick={d.refresh}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden py-0">
        <div className="flex lg:h-[calc(100vh-17rem)] lg:min-h-[520px]">
          {/* List pane */}
          <div className={`w-full shrink-0 lg:w-[400px] lg:overflow-y-auto lg:border-r lg:border-border/60 ${d.selectedId ? 'hidden lg:block' : ''}`}>
            <div className="sticky top-0 z-10 flex min-h-[44px] items-center gap-2 border-b border-border/60 bg-card px-3 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={d.selectAllOnPage}
                disabled={d.emails.length === 0}
                aria-label="Select all on this page"
                className="h-4 w-4 cursor-pointer rounded border-border accent-champagne disabled:cursor-default"
              />
              {selectionCount > 0 ? (
                <div className="flex flex-1 flex-wrap items-center gap-1">
                  <span className="mr-1 font-medium tabular-nums">{selectionCount} selected</span>
                  {!inSpam && d.folder !== 'sent' && (
                    <>
                      <Button size="xs" variant="ghost" onClick={() => d.bulk('markRead')} disabled={d.bulkActing}><MailOpen className="h-3 w-3" /> Read</Button>
                      <Button size="xs" variant="ghost" onClick={() => d.bulk('markUnread')} disabled={d.bulkActing}><Mail className="h-3 w-3" /> Unread</Button>
                    </>
                  )}
                  {d.folder === 'starred'
                    ? <Button size="xs" variant="ghost" onClick={() => d.bulk('unstar')} disabled={d.bulkActing}><StarOff className="h-3 w-3" /> Unstar</Button>
                    : <Button size="xs" variant="ghost" onClick={() => d.bulk('star')} disabled={d.bulkActing}><Star className="h-3 w-3" /> Star</Button>}
                  {d.folder !== 'sent' && (inSpam
                    ? <Button size="xs" variant="ghost" onClick={() => d.bulk('notSpam')} disabled={d.bulkActing}><ShieldCheck className="h-3 w-3" /> Not spam</Button>
                    : <Button size="xs" variant="ghost" onClick={() => d.bulk('spam')} disabled={d.bulkActing}><ShieldAlert className="h-3 w-3" /> Spam</Button>)}
                  {inArchived
                    ? <Button size="xs" variant="ghost" onClick={() => d.bulk('unarchive')} disabled={d.bulkActing}><ArchiveRestore className="h-3 w-3" /> Restore</Button>
                    : <Button size="xs" variant="ghost" onClick={() => d.bulk('archive')} disabled={d.bulkActing}><Archive className="h-3 w-3" /> Archive</Button>}
                  <Button size="xs" variant="ghost" onClick={() => d.bulk('delete')} disabled={d.bulkActing} className="text-red-600 hover:text-red-700"><Trash2 className="h-3 w-3" /> Delete</Button>
                  <button type="button" onClick={d.clearSelection} className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Clear selection"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <span className="text-muted-foreground tabular-nums">
                  {d.loading ? 'Loading…' : `${d.pagination.total.toLocaleString()} ${d.pagination.total === 1 ? 'conversation' : 'conversations'}`}
                </span>
              )}
            </div>

            {d.loading && d.emails.length === 0 ? (
              <div className="space-y-2 p-3">
                {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />)}
              </div>
            ) : (
              <>
                <EmailList
                  emails={d.emails}
                  folder={d.folder}
                  selectedId={d.selectedId}
                  onSelect={d.selectEmail}
                  onToggleStar={d.toggleStar}
                  selectedIds={d.selectedIds}
                  onToggleSelect={d.toggleSelect}
                  searching={!!d.search.trim()}
                  categoryLabel={categoryLabel}
                />
                {d.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
                    <Button size="sm" variant="ghost" onClick={() => d.setPage(Math.max(1, d.page - 1))} disabled={d.page <= 1} aria-label="Previous page">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums">Page {d.page} of {d.pagination.totalPages}</span>
                    <Button size="sm" variant="ghost" onClick={() => d.setPage(Math.min(d.pagination.totalPages, d.page + 1))} disabled={d.page >= d.pagination.totalPages} aria-label="Next page">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Detail pane */}
          <div className={`min-w-0 flex-1 ${d.selectedId ? 'flex' : 'hidden lg:flex'}`}>
            {d.selectedId && d.selectedEmail ? (
              <EmailDetailView
                email={d.selectedEmail}
                thread={d.thread}
                loading={d.threadLoading}
                error={d.threadError}
                details={d.details}
                detailFailed={d.detailFailed}
                sending={d.sending}
                onBack={d.closeDetail}
                onRetry={d.reopen}
                onReply={d.startReply}
                onForward={d.startForward}
                onToggleStar={d.toggleStar}
                onMarkUnread={d.markUnread}
                onSetSpam={d.setSpam}
                onArchive={d.archiveOne}
                onDelete={(id) => d.requestDelete([id])}
                onDeleteConversation={d.requestDeleteThreads}
                onSendAiDraft={d.sendAiDraft}
                onEditAiDraft={d.editAiDraft}
                onDrafted={d.onDrafted}
                onSetProspectStatus={d.setProspectStatus}
              />
            ) : d.selectedId && d.threadLoading ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">Loading conversation…</div>
            ) : d.selectedId && d.threadError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-sm text-red-600">{d.threadError}</p>
                <Button variant="outline" size="sm" onClick={d.closeDetail}>Back to the list</Button>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <InboxIcon className="mb-3 h-10 w-10" />
                <p className="text-sm font-medium text-foreground">Pick an email to read it</p>
                <p className="mt-1 text-xs">The whole conversation shows on the right.</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      <ComposeModal
        compose={d.compose}
        from={from}
        sending={d.sending}
        onField={d.setComposeField}
        onSend={d.handleSend}
        onClose={d.closeCompose}
        onDiscard={d.discardCompose}
      />

      <ConfirmDialog
        open={!!d.pendingDelete}
        onOpenChange={(open) => { if (!open) d.cancelDelete(); }}
        title={deleteTitle}
        description={deleteDescription}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={d.confirmDelete}
      />
    </div>
  );
}

export default function AdminEmailsPage() {
  // useSearchParams (for ?thread= deep links) requires a Suspense boundary
  return (
    <Suspense fallback={<div className="h-24 animate-pulse rounded-lg bg-muted" />}>
      <AdminEmailsPageInner />
    </Suspense>
  );
}
