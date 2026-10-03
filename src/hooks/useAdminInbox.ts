'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { refreshAdminBadges } from '@/hooks/useAdminBadges';
import { HOUSE_TIME_ZONE } from '@/lib/format/dates';
import {
  EMPTY_COUNTS,
  forwardSubject,
  htmlToText,
  isUnread,
  readError,
  replySubject,
  type BulkAction,
  type EmailDetail,
  type EmailRow,
  type FolderCounts,
  type InboxFolder,
  type InboxStatus,
  type OutgoingAttachment,
  type Pagination,
} from '@/components/admin-inbox/types';

export type ComposeMode = 'new' | 'reply' | 'forward';

export interface ComposeState {
  open: boolean;
  mode: ComposeMode;
  to: string;
  subject: string;
  body: string;
  /** Reply: the email being answered. */
  replyTo?: EmailRow;
  /** Forward: the email being passed on. */
  forwardOf?: EmailRow;
  includeOriginalAttachments: boolean;
  quoteOriginal: boolean;
  attachments: OutgoingAttachment[];
  /** One per composed message, so a retried send delivers once. */
  idempotencyKey: string;
}

const SEARCH_DEBOUNCE_MS = 300;
const POLL_MS = 45_000;
const PAGE_SIZE = 30;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyCompose(): ComposeState {
  return {
    open: false, mode: 'new', to: '', subject: '', body: '',
    includeOriginalAttachments: true, quoteOriginal: true, attachments: [], idempotencyKey: newKey(),
  };
}

const forwardDate = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: HOUSE_TIME_ZONE,
});

/** Headers block + quoted original, with room above for the operator's note. */
function forwardBody(email: EmailRow, detail: EmailDetail): string {
  const original = detail.bodyText?.trim() || (detail.bodyHtml ? htmlToText(detail.bodyHtml) : '');
  const from = email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail;
  return [
    '',
    '',
    '---------- Forwarded message ----------',
    `From: ${from}`,
    `Date: ${forwardDate.format(new Date(email.createdAt))}`,
    `Subject: ${email.subject || '(no subject)'}`,
    `To: ${email.toEmail}`,
    '',
    original || '(no message body)',
  ].join('\n');
}

const BULK_TOAST: Record<BulkAction, string> = {
  markRead: 'Marked as read', markUnread: 'Marked as unread', star: 'Starred', unstar: 'Unstarred',
  spam: 'Moved to spam', notSpam: 'Moved back to inbox', archive: 'Archived', unarchive: 'Restored', delete: 'Deleted',
};

const BULK_BODY: Record<Exclude<BulkAction, 'delete'>, Record<string, boolean>> = {
  markRead: { read: true }, markUnread: { read: false }, star: { starred: true }, unstar: { starred: false },
  spam: { spam: true }, notSpam: { spam: false }, archive: { archived: true }, unarchive: { archived: false },
};

export function useAdminInbox() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── List ──
  const [folder, setFolderState] = useState<InboxFolder>('inbox');
  const [category, setCategoryState] = useState<string | null>(null);
  const [categories, setCategories] = useState<Array<{ category: string; count: number }>>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 });
  const [counts, setCounts] = useState<FolderCounts>(EMPTY_COUNTS);

  // ── Detail (one conversation) ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<EmailRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, EmailDetail>>({});
  const [detailFailed, setDetailFailed] = useState<Set<string>>(new Set());

  // ── Compose ──
  const [compose, setCompose] = useState<ComposeState>(() => emptyCompose());
  const [sending, setSending] = useState(false);

  // ── Selection / bulk ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);

  // ── Auto-reply ──
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyLoading, setAutoReplyLoading] = useState(true);

  // ── Receiving status ──
  const [status, setStatus] = useState<InboxStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);

  // Search debounce → page 1
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // Only the newest list request may land: switching folders quickly must
  // not let a slower, older response overwrite the current view.
  const listRequestRef = useRef(0);
  const fetchEmails = useCallback(async (opts: { silent?: boolean } = {}) => {
    const requestId = ++listRequestRef.current;
    if (!opts.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const params = new URLSearchParams({ folder, page: String(page), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (category) params.set('category', category);
      const res = await fetch(`/api/admin/emails?${params}`);
      if (!res.ok) throw new Error(await readError(res, 'Failed to load emails'));
      const data = await res.json();
      if (requestId !== listRequestRef.current) return;
      setEmails(data.data ?? []);
      if (data.pagination) setPagination(data.pagination);
      if (data.counts) setCounts(data.counts);
      if (Array.isArray(data.categories)) setCategories(data.categories);
    } catch (err) {
      if (requestId !== listRequestRef.current) return;
      if (!opts.silent) setError(err instanceof Error ? err.message : 'Failed to load emails');
    } finally {
      if (requestId === listRequestRef.current && !opts.silent) setLoading(false);
    }
  }, [folder, page, debouncedSearch, category]);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  // New mail shows up without a manual refresh: poll while the tab is
  // visible and nothing is selected for a bulk action.
  const fetchEmailsRef = useRef(fetchEmails);
  fetchEmailsRef.current = fetchEmails;
  const selectionSize = selectedIds.size;
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible' || selectionSize > 0) return;
      fetchEmailsRef.current({ silent: true });
    };
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [selectionSize]);

  const fetchStatus = useCallback(async (fresh = false) => {
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/admin/emails/status${fresh ? '?fresh=1' : ''}`);
      if (res.ok) setStatus(await res.json());
    } catch { /* the page still works without the status card */ } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/automation');
        if (res.ok) {
          const body = await res.json();
          setAutoReplyEnabled(body?.data?.aiEmailAutoReply === true);
        }
      } catch { /* defaults to off */ } finally {
        setAutoReplyLoading(false);
      }
    })();
  }, []);

  const setAutoReply = useCallback(async (value: boolean) => {
    setAutoReplyLoading(true);
    try {
      const res = await fetch('/api/admin/automation', {
        method: 'PATCH', headers: JSON_HEADERS,
        body: JSON.stringify({ aiEmailAutoReply: value }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not save'));
      setAutoReplyEnabled(value);
      toast.success(value ? 'AI auto-reply is on' : 'AI auto-reply is off');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setAutoReplyLoading(false);
    }
  }, []);

  // ── Local patching (list + thread stay in step) ──
  const applyLocal = useCallback((ids: string[], patch: Partial<EmailRow>, removeFromList = false) => {
    const set = new Set(ids);
    setEmails((prev) => removeFromList ? prev.filter((e) => !set.has(e.id)) : prev.map((e) => (set.has(e.id) ? { ...e, ...patch } : e)));
    setThread((prev) => prev.map((e) => (set.has(e.id) ? { ...e, ...patch } : e)));
  }, []);

  const bumpCounts = useCallback((patch: Partial<FolderCounts>) => {
    setCounts((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(patch)) {
        const key = k as keyof FolderCounts;
        next[key] = Math.max(0, prev[key] + (v ?? 0));
      }
      return next;
    });
  }, []);

  // Fetch the heavy fields (bodies, AI draft, cross-links) of one email,
  // cached by id. Resolves with the detail (or null on failure) so actions
  // that need the body right away — forwarding — can await it.
  const detailsRef = useRef(details);
  detailsRef.current = details;
  const loadDetail = useCallback(async (id: string): Promise<EmailDetail | null> => {
    if (detailsRef.current[id]) return detailsRef.current[id];
    setDetailFailed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      const r = await fetch(`/api/admin/emails/${id}`);
      if (!r.ok) throw new Error(await readError(r, 'Failed to load email'));
      const d = await r.json();
      const detail: EmailDetail = { ...d.data, links: d.links ?? { userId: null, prospectId: null, outreachId: null } };
      setDetails((prev) => ({ ...prev, [id]: detail }));
      return detail;
    } catch {
      setDetailFailed((prev) => new Set(prev).add(id));
      return null;
    }
  }, []);

  const setRead = useCallback(async (ids: string[], read: boolean) => {
    if (ids.length === 0) return true;
    try {
      const res = await fetch('/api/admin/emails', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ ids, read }) });
      if (!res.ok) throw new Error(await readError(res, 'Failed to update emails'));
      const now = new Date().toISOString();
      applyLocal(ids, read ? { readAt: now } : { readAt: null });
      bumpCounts({ unread: read ? -ids.length : ids.length });
      void refreshAdminBadges();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update emails');
      return false;
    }
  }, [applyLocal, bumpCounts]);

  // ── Detail: one conversation on the right ──
  // The conversation most recently asked for: a slower response for one the
  // operator has already left must not land under the one now open.
  const latestThreadRef = useRef<string | null>(null);
  const openConversation = useCallback(async (email: EmailRow | { id: string; threadId: string | null }, opts: { markRead?: boolean } = {}) => {
    const key = email.threadId || email.id;
    latestThreadRef.current = key;
    setSelectedId(email.id);
    setThreadLoading(true);
    setThreadError(null);
    try {
      const res = await fetch(`/api/admin/emails?thread_id=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(await readError(res, 'Failed to load conversation'));
      const d = await res.json();
      if (latestThreadRef.current !== key) return;
      const rows: EmailRow[] = d.data ?? [];
      setThread(rows);
      // A deep link may name a root that was since deleted and re-rooted:
      // land on the newest message rather than nothing.
      if (!rows.some((r) => r.id === email.id)) setSelectedId(rows.length > 0 ? rows[rows.length - 1].id : null);
      // Thread rows are slim headers — fetch each body on demand.
      rows.forEach((e) => { void loadDetail(e.id); });
      // Opening a conversation reads every unopened message in it.
      if (opts.markRead !== false) {
        const unreadIds = rows.filter(isUnread).map((e) => e.id);
        if (unreadIds.length > 0) void setRead(unreadIds, true);
      }
    } catch (err) {
      if (latestThreadRef.current === key) setThreadError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      if (latestThreadRef.current === key) setThreadLoading(false);
    }
  }, [loadDetail, setRead]);

  const selectEmail = useCallback((id: string) => {
    const row = emails.find((e) => e.id === id) ?? thread.find((e) => e.id === id);
    if (!row) return;
    void openConversation(row);
  }, [emails, thread, openConversation]);

  const closeDetail = useCallback(() => {
    latestThreadRef.current = null;
    setSelectedId(null);
    setThread([]);
    setThreadError(null);
    if (searchParams.get('thread')) router.replace('/admin/emails', { scroll: false });
  }, [router, searchParams]);

  // Deep link: /admin/emails?thread=<thread or email id> (other admin pages
  // link conversations this way) opens that conversation on load.
  const deepLinkedThread = searchParams.get('thread');
  const openedDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkedThread || openedDeepLink.current === deepLinkedThread) return;
    openedDeepLink.current = deepLinkedThread;
    void openConversation({ id: deepLinkedThread, threadId: deepLinkedThread });
  }, [deepLinkedThread, openConversation]);

  const selectedEmail = useMemo(
    () => emails.find((e) => e.id === selectedId) ?? thread.find((e) => e.id === selectedId) ?? null,
    [emails, thread, selectedId],
  );

  // ── Single-email actions ──
  const patchOne = useCallback(async (id: string, body: Record<string, boolean>) => {
    const res = await fetch(`/api/admin/emails/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await readError(res, 'Update failed'));
  }, []);

  const toggleStar = useCallback(async (id: string) => {
    const row = emails.find((e) => e.id === id) ?? thread.find((e) => e.id === id);
    const current = row?.isStarred ?? false;
    const next = !current;
    applyLocal([id], { isStarred: next }, folder === 'starred' && !next);
    bumpCounts({ starred: next ? 1 : -1 });
    try {
      await patchOne(id, { isStarred: next });
    } catch (err) {
      applyLocal([id], { isStarred: current });
      bumpCounts({ starred: next ? -1 : 1 });
      toast.error(err instanceof Error ? err.message : 'Could not update star');
    }
  }, [emails, thread, folder, applyLocal, bumpCounts, patchOne]);

  const markUnread = useCallback(async (id: string) => {
    if (await setRead([id], false)) {
      applyLocal([id], { status: 'received' });
      closeDetail();
    }
  }, [setRead, applyLocal, closeDetail]);

  const setSpam = useCallback(async (id: string, isSpam: boolean) => {
    try {
      await patchOne(id, { isSpam });
      const leavesFolder = folder !== 'archived' && (folder === 'spam') !== isSpam;
      applyLocal([id], { isSpam }, leavesFolder);
      if (leavesFolder && selectedId === id) closeDetail();
      bumpCounts({ spam: isSpam ? 1 : -1 });
      toast.success(isSpam ? 'Moved to spam' : 'Moved back to inbox');
      void fetchEmails({ silent: true });
      void refreshAdminBadges();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update');
    }
  }, [folder, selectedId, patchOne, applyLocal, bumpCounts, closeDetail, fetchEmails]);

  const setArchived = useCallback(async (ids: string[], archived: boolean) => {
    if (ids.length === 0) return false;
    try {
      const res = await fetch('/api/admin/emails', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ ids, archived }) });
      if (!res.ok) throw new Error(await readError(res, 'Failed to update emails'));
      const now = new Date().toISOString();
      const leavesFolder = (folder === 'archived') !== archived;
      applyLocal(ids, { archivedAt: archived ? now : null }, leavesFolder);
      bumpCounts({ archived: archived ? ids.length : -ids.length });
      if (leavesFolder && selectedId && ids.includes(selectedId)) closeDetail();
      toast.success(archived ? (ids.length === 1 ? 'Archived' : `Archived ${ids.length}`) : (ids.length === 1 ? 'Restored' : `Restored ${ids.length}`));
      void refreshAdminBadges();
      void fetchEmails({ silent: true });
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update emails');
      return false;
    }
  }, [folder, selectedId, applyLocal, bumpCounts, closeDetail, fetchEmails]);

  const archiveOne = useCallback((email: EmailRow) => setArchived([email.id], !email.archivedAt), [setArchived]);
  const archiveThread = useCallback(() => setArchived(thread.map((e) => e.id), true), [setArchived, thread]);

  // Deletes always confirm first (the page renders the dialog).
  const requestDelete = useCallback((ids: string[]) => { if (ids.length) setPendingDelete(ids); }, []);
  const cancelDelete = useCallback(() => setPendingDelete(null), []);
  const confirmDelete = useCallback(async () => {
    const ids = pendingDelete;
    if (!ids?.length) return;
    setBulkActing(true);
    try {
      const res = await fetch('/api/admin/emails', { method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify({ ids }) });
      if (!res.ok) throw new Error(await readError(res, 'Delete failed'));
      setEmails((prev) => prev.filter((e) => !ids.includes(e.id)));
      setSelectedIds(new Set());
      setPendingDelete(null);
      toast.success(ids.length === 1 ? 'Email deleted' : `${ids.length} emails deleted`);
      void refreshAdminBadges();
      if (selectedId && ids.includes(selectedId)) {
        // The conversation may live on without this message.
        const rest = thread.filter((e) => !ids.includes(e.id));
        if (rest.length > 0) void openConversation(rest[rest.length - 1], { markRead: false });
        else closeDetail();
      } else if (selectedId) {
        setThread((prev) => prev.filter((e) => !ids.includes(e.id)));
      }
      void fetchEmails({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
      throw err;
    } finally {
      setBulkActing(false);
    }
  }, [pendingDelete, selectedId, thread, openConversation, closeDetail, fetchEmails]);

  // ── Bulk ──
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => (prev.size === emails.length && emails.length > 0 ? new Set() : new Set(emails.map((e) => e.id))));
  }, [emails]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const bulk = useCallback(async (action: BulkAction) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (action === 'delete') { requestDelete(ids); return; }
    setBulkActing(true);
    try {
      const res = await fetch('/api/admin/emails', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ ids, ...BULK_BODY[action] }) });
      if (!res.ok) throw new Error(await readError(res, 'Action failed'));
      setSelectedIds(new Set());
      if (selectedId && ids.includes(selectedId) && ['spam', 'notSpam', 'archive', 'unarchive'].includes(action)) closeDetail();
      await fetchEmails({ silent: true });
      void refreshAdminBadges();
      toast.success(BULK_TOAST[action]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBulkActing(false);
    }
  }, [selectedIds, selectedId, requestDelete, closeDetail, fetchEmails]);

  // ── Compose ──
  const openCompose = useCallback(() => {
    // Reopen a half-written new email rather than wiping it.
    setCompose((prev) => (prev.mode === 'new' && (prev.to || prev.subject || prev.body))
      ? { ...prev, open: true }
      : { ...emptyCompose(), open: true });
  }, []);

  const startReply = useCallback((email: EmailRow, seed = '') => {
    setCompose({
      ...emptyCompose(),
      open: true,
      mode: 'reply',
      to: email.direction === 'inbound' ? email.fromEmail : email.toEmail,
      subject: replySubject(email.subject),
      body: seed,
      replyTo: email,
    });
  }, []);

  /** Open the composer prefilled as a forward of this email (needs its body). */
  const startForward = useCallback(async (email: EmailRow) => {
    const detail = detailsRef.current[email.id] ?? await loadDetail(email.id);
    if (!detail) {
      toast.error('Could not load the original message, so it cannot be forwarded yet.');
      return;
    }
    setCompose({
      ...emptyCompose(),
      open: true,
      mode: 'forward',
      to: '',
      subject: forwardSubject(email.subject),
      body: forwardBody(email, detail),
      forwardOf: email,
    });
  }, [loadDetail]);

  const editAiDraft = useCallback((email: EmailRow) => {
    const detail = detailsRef.current[email.id];
    if (!detail?.aiDraftText) return;
    startReply(email, detail.aiDraftText);
  }, [startReply]);

  const setComposeField = useCallback(<K extends keyof ComposeState>(field: K, value: ComposeState[K]) => {
    setCompose((prev) => ({ ...prev, [field]: value }));
  }, []);

  /** Hide the window but keep what was typed (a forward is discarded). */
  const closeCompose = useCallback(() => {
    setCompose((prev) => (prev.mode === 'forward' ? emptyCompose() : { ...prev, open: false }));
  }, []);
  const discardCompose = useCallback(() => setCompose(emptyCompose()), []);

  const handleSend = useCallback(async () => {
    const to = compose.to.trim();
    const subject = compose.subject.trim();
    const body = compose.body.trim();
    if (!to || !subject || !body) {
      toast.error('Fill in the recipient, subject and message');
      return;
    }
    const outgoing = compose.attachments.length > 0
      ? { attachments: compose.attachments.map(({ content, filename, contentType }) => ({ content, filename, contentType })) }
      : {};
    setSending(true);
    try {
      let res: Response;
      if (compose.mode === 'forward' && compose.forwardOf) {
        res = await fetch(`/api/admin/emails/${compose.forwardOf.id}/forward`, {
          method: 'POST', headers: JSON_HEADERS,
          body: JSON.stringify({ to, subject, text: compose.body, includeAttachments: compose.includeOriginalAttachments, ...outgoing }),
        });
      } else {
        res = await fetch('/api/admin/emails', {
          method: 'POST', headers: JSON_HEADERS,
          body: JSON.stringify({
            to, subject, text: body,
            inReplyToId: compose.replyTo?.id,
            quoteOriginal: compose.quoteOriginal,
            idempotencyKey: compose.idempotencyKey,
            ...outgoing,
          }),
        });
      }
      if (!res.ok) throw new Error(await readError(res, 'Failed to send'));

      const mode = compose.mode;
      const replyTo = compose.replyTo;
      const forwardOf = compose.forwardOf;
      setCompose(emptyCompose());

      if (mode === 'forward' && forwardOf) {
        const d = await res.json().catch(() => ({}));
        const skipped: number = d?.attachments?.skipped ?? 0;
        toast.success(skipped > 0
          ? `Forwarded to ${to} — ${skipped} attachment${skipped === 1 ? ' was' : 's were'} too large to include`
          : `Forwarded to ${to}`);
        // The server counts an unopened original as read and roots its thread.
        applyLocal([forwardOf.id], {
          readAt: forwardOf.readAt ?? new Date().toISOString(),
          status: forwardOf.status === 'received' ? 'read' : forwardOf.status,
          threadId: forwardOf.threadId ?? forwardOf.id,
        });
        if (selectedId) void openConversation(forwardOf.threadId ? forwardOf : { ...forwardOf, threadId: forwardOf.id }, { markRead: false });
      } else if (mode === 'reply' && replyTo) {
        toast.success(`Reply sent to ${to}`);
        applyLocal([replyTo.id], { status: 'replied', readAt: replyTo.readAt ?? new Date().toISOString(), threadId: replyTo.threadId ?? replyTo.id });
        bumpCounts({ needsReview: replyTo.aiDraftedAt && replyTo.status !== 'replied' ? -1 : 0 });
        if (selectedId) void openConversation({ ...replyTo, threadId: replyTo.threadId ?? replyTo.id }, { markRead: false });
      } else {
        toast.success(`Email sent to ${to}`);
      }
      void refreshAdminBadges();
      void fetchEmails({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }, [compose, selectedId, applyLocal, bumpCounts, openConversation, fetchEmails]);

  // ── AI draft ──
  const onDrafted = useCallback((email: EmailRow, draft: { aiDraftText: string; aiDraftedAt: string }) => {
    setDetails((prev) => (prev[email.id] ? { ...prev, [email.id]: { ...prev[email.id], ...draft } } : prev));
    applyLocal([email.id], { aiDraftedAt: draft.aiDraftedAt });
  }, [applyLocal]);

  const sendAiDraft = useCallback(async (email: EmailRow) => {
    setSending(true);
    try {
      const res = await fetch(`/api/admin/emails/${email.id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ useAiDraft: true }) });
      if (!res.ok) throw new Error(await readError(res, 'Failed to send draft'));
      toast.success(`AI reply sent to ${email.fromEmail}`);
      applyLocal([email.id], { status: 'replied', readAt: email.readAt ?? new Date().toISOString(), threadId: email.threadId ?? email.id });
      bumpCounts({ needsReview: -1 });
      void refreshAdminBadges();
      void openConversation({ ...email, threadId: email.threadId ?? email.id }, { markRead: false });
      void fetchEmails({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send draft');
    } finally {
      setSending(false);
    }
  }, [applyLocal, bumpCounts, openConversation, fetchEmails]);

  // ── Test email ──
  const sendTest = useCallback(async () => {
    setSendingTest(true);
    try {
      const res = await fetch('/api/admin/emails/test', { method: 'POST', headers: JSON_HEADERS });
      if (!res.ok) throw new Error(await readError(res, 'Test send failed'));
      const data = await res.json();
      toast.success(`Test sent to ${data.to}. Reply to it and watch the Inbox.`);
      void fetchEmails({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      setSendingTest(false);
    }
  }, [fetchEmails]);

  // ── Navigation ──
  const setFolder = useCallback((next: InboxFolder) => {
    setFolderState(next);
    setCategoryState(null);
    setPage(1);
    setSelectedIds(new Set());
    closeDetail();
  }, [closeDetail]);

  const setCategory = useCallback((next: string | null) => {
    setCategoryState(next);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  // ── Keyboard shortcuts (j/k next & previous, r reply, f forward, e archive, s star, Esc close) ──
  const latest = useRef({ emails, selectedId, selectedEmail, selectEmail, startReply, startForward, archiveOne, toggleStar, closeDetail, composeOpen: compose.open });
  latest.current = { emails, selectedId, selectedEmail, selectEmail, startReply, startForward, archiveOne, toggleStar, closeDetail, composeOpen: compose.open };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      const s = latest.current;
      if (s.composeOpen) return;
      if (e.key === 'j' || e.key === 'k') {
        if (s.emails.length === 0) return;
        const idx = s.emails.findIndex((m) => m.id === s.selectedId);
        const nextIdx = e.key === 'j' ? Math.min(s.emails.length - 1, idx + 1) : Math.max(0, idx === -1 ? 0 : idx - 1);
        const next = s.emails[nextIdx];
        if (next && next.id !== s.selectedId) {
          s.selectEmail(next.id);
          document.getElementById(`email-${next.id}`)?.scrollIntoView({ block: 'nearest' });
        }
        e.preventDefault();
      } else if (e.key === 'r' && s.selectedEmail?.direction === 'inbound') {
        s.startReply(s.selectedEmail);
        e.preventDefault();
      } else if (e.key === 'f' && s.selectedEmail) {
        void s.startForward(s.selectedEmail);
        e.preventDefault();
      } else if (e.key === 'e' && s.selectedEmail) {
        void s.archiveOne(s.selectedEmail);
        e.preventDefault();
      } else if (e.key === 's' && s.selectedEmail) {
        void s.toggleStar(s.selectedEmail.id);
        e.preventDefault();
      } else if (e.key === 'Escape' && s.selectedId) {
        s.closeDetail();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return {
    folder, setFolder, category, setCategory, categories,
    emails, loading, error, search, setSearch, page, setPage, pagination, counts,
    refresh: () => fetchEmails(),
    selectedId, selectedEmail, thread, threadLoading, threadError, details, detailFailed, loadDetail,
    selectEmail, closeDetail, reopen: () => selectedEmail && openConversation(selectedEmail, { markRead: false }),
    toggleStar, markUnread, setSpam, archiveOne, archiveThread, requestDelete, cancelDelete, confirmDelete, pendingDelete,
    selectedIds, toggleSelect, selectAllOnPage, clearSelection, bulk, bulkActing,
    sendAiDraft, editAiDraft, onDrafted,
    autoReplyEnabled, autoReplyLoading, setAutoReply,
    compose, setComposeField, openCompose, startReply, startForward, closeCompose, discardCompose, sending, handleSend,
    status, statusLoading, refreshStatus: () => fetchStatus(true), sendTest, sendingTest,
  };
}

export type AdminInbox = ReturnType<typeof useAdminInbox>;
