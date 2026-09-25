'use client';

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, X, Check, WifiOff, ArrowRight, Phone, Lock, RotateCcw } from 'lucide-react';
import { useUploadManager } from '@/hooks/useUploadManager';
import { CaptureBar } from '@/components/upload/CaptureBar';
import { ItemCard } from '@/components/upload/ItemCard';
import { ReviewScreen } from '@/components/upload/ReviewScreen';
import { UploadHeader } from '@/components/upload/UploadHeader';
import { BUSINESS } from '@/lib/config';
import { buildSubmission } from '@/lib/upload/upload-queue';
import { keepScreenAwake } from '@/lib/upload/wake-lock';
import {
  clearUploadState,
  loadUploadState,
  restoredCounts,
  saveUploadState,
  snapshotUploadState,
} from '@/lib/upload/persist';

interface CaptureItem {
  id: string;
  taskIds: string[];
  notes: string;
}

interface LinkData {
  prospectName: string;
  maxItems: number | null;
  itemCount: number;
}

type PageState = 'loading' | 'invalid' | 'unavailable' | 'capture' | 'review' | 'submitting' | 'success';

// Marks the history entry pushed on entering Review, so a back-swipe
// returns to the capture screen instead of leaving the page.
const REVIEW_HISTORY_KEY = 'mayellsUploadReview';

// A send with no clear answer may still have been saved. Sending again is
// safe (the server adds only what it doesn't already have), so say so.
const UNCONFIRMED_SEND =
  'We couldn’t confirm your send. It may have gone through; tap Send again to make sure. Nothing will be sent twice.';

function subscribeToOnlineStatus(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

const getOnlineSnapshot = () => navigator.onLine;
const getServerOnlineSnapshot = () => true;

function emptyItem(): CaptureItem {
  return { id: `item-${Date.now()}-${Math.random().toString(36).slice(2)}`, taskIds: [], notes: '' };
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function isReviewEntry(state: unknown) {
  return !!(state && typeof state === 'object' && (state as Record<string, unknown>)[REVIEW_HISTORY_KEY]);
}

export default function UploadPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [validateAttempt, setValidateAttempt] = useState(0);
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [items, setItems] = useState<CaptureItem[]>(() => [emptyItem()]);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [restoredNote, setRestoredNote] = useState('');
  // Nothing is saved until any earlier copy has been read back, or the
  // empty first render would overwrite it.
  const [hydrated, setHydrated] = useState(false);
  const restoredRef = useRef(false);
  const lastSavedRef = useRef('');
  const isOnline = useSyncExternalStore(subscribeToOnlineStatus, getOnlineSnapshot, getServerOnlineSnapshot);

  const { tasks, addFiles, retryFailed, retryTask, removeTask, restoreCompleted, reset } = useUploadManager(token);

  // Bring back finished uploads from before a reload (see lib/upload/persist).
  const restoreSaved = useCallback(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = loadUploadState(token);
    if (!saved) return;
    const withMedia = saved.items.filter((item) => item.media.length > 0);
    const idGroups = restoreCompleted(withMedia.map((item) => item.media));
    const restored = withMedia.map((item, i) => ({ ...emptyItem(), taskIds: idGroups[i], notes: item.notes }));
    // If the last piece was still uploading, new photos keep going into it;
    // otherwise the seller starts on a fresh item.
    const last = saved.items.at(-1);
    const continueLast = !!last && last.unfinished > 0 && last.media.length > 0;
    setItems(continueLast ? restored : [...restored, emptyItem()]);

    const { photos, videos, unfinished } = restoredCounts(saved);
    const what = [photos && plural(photos, 'photo'), videos && plural(videos, 'video')].filter(Boolean).join(' and ');
    setRestoredNote(
      `Restored ${what} from earlier.` +
        (unfinished > 0
          ? ` ${unfinished === 1 ? 'One' : unfinished} that hadn’t uploaded will need adding again.`
          : ''),
    );
  }, [token, restoreCompleted]);

  // Token validation. A dropped connection isn't a dead link: say so, and
  // try again by itself when the phone is back online.
  useEffect(() => {
    let cancelled = false;
    async function validateToken() {
      try {
        const res = await fetch(`/api/upload/${token}`);
        if (cancelled) return;
        if (res.status === 404 || res.status === 410) {
          // Nothing saved for a dead link can ever be sent.
          clearUploadState(token);
          setState('invalid');
          return;
        }
        if (!res.ok) {
          setState('unavailable');
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setLinkData(data);
        restoreSaved();
        setHydrated(true);
        setState((prev) => (prev === 'loading' || prev === 'unavailable' ? 'capture' : prev));
      } catch {
        if (!cancelled) setState('unavailable');
      }
    }
    validateToken();
    return () => {
      cancelled = true;
    };
  }, [token, validateAttempt, restoreSaved]);

  useEffect(() => {
    if (state !== 'unavailable') return;
    const retry = () => setValidateAttempt((n) => n + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [state]);

  // Keep a copy of finished work so a reload can't lose it.
  useEffect(() => {
    if (!hydrated || state === 'success') return;
    const snapshot = snapshotUploadState(items, tasks, Date.now());
    const key = snapshot ? JSON.stringify(snapshot.items) : '';
    if (key === lastSavedRef.current) return;
    lastSavedRef.current = key;
    saveUploadState(token, snapshot);
  }, [hydrated, items, tasks, state, token]);

  // Service worker: scoped to /upload/ so it can only ever see this flow.
  // Earlier builds registered it for the whole site, where it proxied every
  // request on mayells.com; remove those registrations wherever they linger.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations
            .filter((r) => new URL(r.scope).pathname === '/')
            .map((r) => r.unregister()),
        ),
      )
      .catch(() => {})
      .finally(() => {
        navigator.serviceWorker.register('/sw.js', { scope: '/upload/' }).catch(() => {
          // SW registration is non-critical
        });
      });
  }, []);

  // Back/forward between capture and review. A reload keeps the history
  // entry but starts on capture, so drop a stale review marker first.
  useEffect(() => {
    if (isReviewEntry(window.history.state)) {
      window.history.replaceState({ ...window.history.state, [REVIEW_HISTORY_KEY]: false }, '');
    }
    const onPopState = (e: PopStateEvent) => {
      const toReview = isReviewEntry(e.state);
      setErrorMessage('');
      setState((prev) => {
        if (!toReview && (prev === 'review' || prev === 'success')) return 'capture';
        if (toReview && prev === 'capture') return 'review';
        return prev;
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openReview = useCallback(() => {
    window.history.pushState({ [REVIEW_HISTORY_KEY]: true }, '');
    setState('review');
    window.scrollTo(0, 0);
  }, []);

  const closeReview = useCallback(() => {
    setErrorMessage('');
    if (isReviewEntry(window.history.state)) window.history.back();
    else setState('capture');
  }, []);

  // Handle files from capture bar (add to current item)
  const handleFilesSelected = useCallback(
    (files: File[]) => {
      const taskIds = addFiles(files);
      setItems((prev) => {
        const updated = [...prev];
        const currentIdx = updated.length - 1;
        updated[currentIdx] = {
          ...updated[currentIdx],
          taskIds: [...updated[currentIdx].taskIds, ...taskIds],
        };
        return updated;
      });
    },
    [addFiles]
  );

  // Start a new item
  const handleNextItem = useCallback(() => {
    setItems((prev) => [...prev, emptyItem()]);
  }, []);

  const handleNotesChange = useCallback((itemId: string, notes: string) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, notes } : item)));
  }, []);

  // Remove one photo or video, whatever state it is in. An earlier item left
  // empty goes too, so the item numbers stay in step with what is shown.
  const handleRemoveMedia = useCallback(
    (taskId: string) => {
      removeTask(taskId);
      setItems((prev) =>
        prev
          .map((item) => ({ ...item, taskIds: item.taskIds.filter((id) => id !== taskId) }))
          .filter((item, i, all) => item.taskIds.length > 0 || i === all.length - 1)
      );
    },
    [removeTask]
  );

  // Remove an entire item
  const handleRemoveItem = useCallback(
    (itemId: string) => {
      items.find((item) => item.id === itemId)?.taskIds.forEach((id) => removeTask(id));
      setItems((prev) => {
        const updated = prev.filter((item) => item.id !== itemId);
        return updated.length === 0 ? [emptyItem()] : updated;
      });
    },
    [items, removeTask]
  );

  // Send every item with at least one finished upload. Sending again is
  // always safe: the server adds only what it doesn't already have.
  const handleSubmit = useCallback(async () => {
    const payload = buildSubmission(items, tasks);
    if (payload.length === 0) return;

    // Before any await, while this is still the tap's gesture. A phone that
    // locks mid-send loses the reply, and the seller sees an error for a send
    // that went through.
    const releaseScreen = keepScreenAwake();
    setErrorMessage('');
    setState('submitting');
    try {
      const res = await fetch(`/api/upload/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // A 5xx (or a gateway timeout) doesn't say whether the send was saved.
        setErrorMessage(res.status >= 500 ? UNCONFIRMED_SEND : data.error || 'Something went wrong. Please try again.');
        setState('review');
        return;
      }

      clearUploadState(token);
      lastSavedRef.current = '';
      reset();
      setItems([emptyItem()]);
      setRestoredNote('');
      setSubmittedCount(payload.length);
      setState('success');
      window.scrollTo(0, 0);
    } catch {
      // No reply at all: the send may still have reached us (the phone
      // locked, or the signal dropped on the way back).
      setErrorMessage(
        navigator.onLine
          ? UNCONFIRMED_SEND
          : 'You’re offline, so we couldn’t confirm your send. Everything is saved here; tap Send again once you’re connected. Nothing will be sent twice.'
      );
      setState('review');
    } finally {
      releaseScreen();
    }
  }, [items, tasks, token, reset]);

  // Items with media (for display)
  const itemsWithMedia = items.filter((item) => item.taskIds.length > 0);
  const currentItemHasMedia = items[items.length - 1]?.taskIds.length > 0;
  const totalMediaCount = items.reduce((sum, item) => sum + item.taskIds.length, 0);
  // "Hello, Nathan", not "Hello, Nathan Mayell".
  const firstName = linkData?.prospectName?.trim().split(/\s+/)[0] ?? '';

  const offlineBanner = !isOnline && (
    <div
      role="status"
      className="sticky top-16 z-30 flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-[13px] text-amber-950"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      You&apos;re offline. Photos will upload when you&apos;re back online.
    </div>
  );

  // ── Loading ──
  if (state === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-7 w-7 animate-spin text-champagne-deep mx-auto mb-4" />
          <p className="text-charcoal/60 text-sm">Opening your upload page…</p>
        </div>
      </div>
    );
  }

  // ── Couldn't reach us ──
  if (state === 'unavailable') {
    return (
      <>
        <UploadHeader />
        <div className="px-5 pt-16 pb-10">
          <div className="max-w-md mx-auto text-center">
            <div className="w-14 h-14 rounded-full bg-charcoal/5 flex items-center justify-center mx-auto mb-6">
              <WifiOff className="h-6 w-6 text-charcoal/45" />
            </div>
            <h1 className="font-display text-2xl mb-3">
              {isOnline ? 'We couldn’t open your upload page' : 'You’re offline'}
            </h1>
            <p className="text-charcoal/65 leading-relaxed">
              {isOnline
                ? 'Please try again in a moment. Anything you already uploaded is safe.'
                : 'Connect to Wi-Fi or mobile data and the page will open by itself.'}
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setValidateAttempt((n) => n + 1)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-charcoal text-white text-[15px] font-medium"
              >
                <RotateCcw className="h-4 w-4" />
                Try again
              </button>
              <a
                href={BUSINESS.phoneHref}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-charcoal/15 text-[15px] font-medium"
              >
                <Phone className="h-4 w-4" />
                {BUSINESS.phone}
              </a>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Invalid ──
  if (state === 'invalid') {
    return (
      <>
        <UploadHeader />
        <div className="px-5 pt-16 pb-10">
          <div className="max-w-md mx-auto text-center">
            <div className="w-14 h-14 rounded-full bg-charcoal/5 flex items-center justify-center mx-auto mb-6">
              <X className="h-7 w-7 text-charcoal/40" />
            </div>
            <h1 className="font-display text-2xl mb-3">This link is no longer active</h1>
            <p className="text-charcoal/65 leading-relaxed">
              Call or email us and we will send you a new one straight away.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <a
                href={BUSINESS.phoneHref}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-charcoal text-white text-[15px] font-medium"
              >
                <Phone className="h-4 w-4" />
                {BUSINESS.phone}
              </a>
              <a
                href={`mailto:${BUSINESS.email}`}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-charcoal/15 text-[15px] font-medium"
              >
                {BUSINESS.email}
              </a>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Success ──
  if (state === 'success') {
    return (
      <>
        <UploadHeader />
        <div className="px-5 pt-16 pb-10">
          <div className="max-w-md mx-auto text-center">
            <div className="w-14 h-14 rounded-full bg-champagne/25 flex items-center justify-center mx-auto mb-6">
              <Check className="h-7 w-7 text-champagne-deep" />
            </div>
            <h1 className="font-display text-3xl mb-3">
              Thank you{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-charcoal/65 leading-relaxed">
              We have your {submittedCount} {submittedCount === 1 ? 'item' : 'items'}. A Mayells specialist
              will look through them and be in touch within 1&ndash;2 business days.
            </p>
            <p className="mt-4 text-charcoal/65 leading-relaxed">
              More to show us? You can use this same link again at any time.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setItems([emptyItem()]);
                  // Step back off the review entry, so the next back-swipe leaves.
                  if (isReviewEntry(window.history.state)) window.history.back();
                  else setState('capture');
                }}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-charcoal text-white text-[15px] font-medium"
              >
                Add more items
              </button>
              <a
                href={BUSINESS.url}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-charcoal/15 text-[15px] font-medium"
              >
                Visit mayells.com
              </a>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Review ──
  if (state === 'review' || state === 'submitting') {
    return (
      <ReviewScreen
        items={itemsWithMedia}
        tasks={tasks}
        online={isOnline}
        onNotesChange={handleNotesChange}
        onRemoveMedia={handleRemoveMedia}
        onRetryMedia={retryTask}
        onRetryFailed={retryFailed}
        onBack={closeReview}
        onSubmit={handleSubmit}
        isSubmitting={state === 'submitting'}
        submitError={errorMessage}
        onDismissError={() => setErrorMessage('')}
        banner={offlineBanner}
      />
    );
  }

  // ── Capture ──
  return (
    <>
      <UploadHeader>
        {itemsWithMedia.length > 0 ? (
          <div className="flex items-center gap-3">
            <span className="hidden min-[420px]:inline whitespace-nowrap text-xs text-charcoal/55 tabular-nums">
              {itemsWithMedia.length} {itemsWithMedia.length === 1 ? 'item' : 'items'} &middot;{' '}
              {totalMediaCount} {totalMediaCount === 1 ? 'photo' : 'photos'}
            </span>
            <button
              type="button"
              onClick={openReview}
              className="flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-4 bg-charcoal text-white text-sm font-medium rounded-lg motion-safe:active:scale-[0.97] motion-safe:transition-transform"
            >
              Review &amp; send
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : undefined}
      </UploadHeader>
      {offlineBanner}

      {/* Clear of the fixed capture bar, whose height it publishes as --mobile-cta-bar on phones. */}
      <main className="px-5 pb-[max(12rem,calc(var(--mobile-cta-bar,0px)+1.5rem))] max-w-xl mx-auto">
        {restoredNote && (
          <div role="status" className="mt-5 flex items-start justify-between gap-2 rounded-xl border border-champagne/40 bg-champagne/10 py-1 pl-3.5 pr-1 text-[14px] leading-snug text-charcoal/80">
            <p className="py-2.5">{restoredNote}</p>
            <button
              type="button"
              onClick={() => setRestoredNote('')}
              aria-label="Dismiss"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-charcoal/50 hover:text-charcoal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {totalMediaCount === 0 ? (
          <>
            <div className="pt-10 sm:pt-14">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-champagne-deep">
                Private upload
              </p>
              <h1 className="mt-3 font-display text-[32px] leading-tight sm:text-4xl">
                Hello{firstName ? `, ${firstName}` : ''}
              </h1>
              <p className="mt-3 text-[16px] leading-relaxed text-charcoal/70">
                Send us photos of the pieces you would like to consign. A specialist will review them and
                come back to you with our thoughts, free and with no obligation.
              </p>
              {linkData?.maxItems && (
                <p className="mt-3 text-sm text-champagne-deep">
                  Up to {linkData.maxItems - linkData.itemCount} more items on this link
                </p>
              )}
            </div>

            <ol className="mt-9 space-y-5">
              {[
                ['Photograph one piece at a time', 'Take as many photos of it as you like: the whole piece, the back or underside, any signature, maker’s mark or label, and any damage.'],
                ['Tap “Next item” for the next piece', 'That keeps each piece’s photos together, so we know what belongs with what.'],
                ['Review and send', 'Add anything you know about each piece, such as where it came from or how old it is, then send it to us.'],
              ].map(([title, text], i) => (
                <li key={title} className="flex gap-4">
                  <span className="font-display text-2xl leading-none text-champagne-deep tabular-nums w-5 shrink-0">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-[15px]">{title}</p>
                    <p className="mt-1 text-[14.5px] leading-relaxed text-charcoal/65">{text}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-9 rounded-2xl border border-charcoal/10 bg-white p-4 text-[14px] leading-relaxed text-charcoal/70">
              <p className="font-medium text-charcoal">For the best photos</p>
              <p className="mt-1">
                Daylight near a window, no flash. Fill the frame with the piece, and keep it in focus.
                Phone photos are perfect. Short videos are welcome too, up to about 20 seconds.
              </p>
            </div>

            <p className="mt-6 flex items-start gap-2 text-[13px] leading-relaxed text-charcoal/55">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Only you and Mayells specialists can see what you send. Location data is removed from your
              photos and videos.
            </p>
          </>
        ) : (
          <div className="pt-5 space-y-4">
            {itemsWithMedia.map((item, idx) => (
              <ItemCard
                key={item.id}
                index={idx}
                taskIds={item.taskIds}
                tasks={tasks}
                notes={item.notes}
                online={isOnline}
                onNotesChange={(notes) => handleNotesChange(item.id, notes)}
                onRemoveMedia={handleRemoveMedia}
                onRetryMedia={retryTask}
                onRemoveItem={() => handleRemoveItem(item.id)}
                canRemove={itemsWithMedia.length > 1}
              />
            ))}
            {!currentItemHasMedia && (
              <p className="rounded-2xl border-2 border-dashed border-charcoal/15 px-4 py-6 text-center text-[14.5px] text-charcoal/55">
                Item {items.length}: add photos with the buttons below
              </p>
            )}
          </div>
        )}
      </main>

      <CaptureBar
        onFilesSelected={handleFilesSelected}
        onNextItem={handleNextItem}
        hasCurrentItemMedia={currentItemHasMedia}
        itemNumber={items.length}
      />
    </>
  );
}
