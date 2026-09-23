'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, X, Check, WifiOff, ArrowRight, Phone, Lock } from 'lucide-react';
import { useUploadManager } from '@/hooks/useUploadManager';
import { CaptureBar } from '@/components/upload/CaptureBar';
import { ItemCard } from '@/components/upload/ItemCard';
import { ReviewScreen } from '@/components/upload/ReviewScreen';
import { UploadHeader } from '@/components/upload/UploadHeader';
import { BUSINESS } from '@/lib/config';

interface CaptureItem {
  taskIds: string[];
  notes: string;
}

interface LinkData {
  prospectName: string;
  maxItems: number | null;
  itemCount: number;
}

type PageState = 'loading' | 'invalid' | 'capture' | 'review' | 'submitting' | 'success';

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

export default function UploadPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [items, setItems] = useState<CaptureItem[]>([{ taskIds: [], notes: '' }]);
  const [submittedCount, setSubmittedCount] = useState(0);
  const isOnline = useSyncExternalStore(subscribeToOnlineStatus, getOnlineSnapshot, getServerOnlineSnapshot);

  const { tasks, addFiles, retryFailed, removeTask, isUploading, hasErrors } = useUploadManager(token);

  // Token validation
  useEffect(() => {
    async function validateToken() {
      try {
        const res = await fetch(`/api/upload/${token}`);
        if (!res.ok) {
          setState('invalid');
          return;
        }
        const data = await res.json();
        setLinkData(data);
        setState('capture');
      } catch {
        setState('invalid');
      }
    }
    validateToken();
  }, [token]);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration is non-critical
      });
    }
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
    setItems((prev) => [...prev, { taskIds: [], notes: '' }]);
  }, []);

  // Update notes for an item
  const handleNotesChange = useCallback((index: number, notes: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, notes } : item)));
  }, []);

  // Remove media from an item
  const handleRemoveMedia = useCallback(
    (itemIndex: number, taskId: string) => {
      removeTask(taskId);
      setItems((prev) =>
        prev.map((item, i) =>
          i === itemIndex
            ? { ...item, taskIds: item.taskIds.filter((id) => id !== taskId) }
            : item
        )
      );
    },
    [removeTask]
  );

  // Remove an entire item
  const handleRemoveItem = useCallback(
    (index: number) => {
      setItems((prev) => {
        const item = prev[index];
        // Clean up upload tasks
        item.taskIds.forEach((id) => removeTask(id));
        const updated = prev.filter((_, i) => i !== index);
        return updated.length === 0 ? [{ taskIds: [], notes: '' }] : updated;
      });
    },
    [removeTask]
  );

  // Submit all items
  const handleSubmit = useCallback(async () => {
    // Filter to items that have completed uploads
    const validItems = items.filter((item) => {
      const completedUrls = item.taskIds
        .map((id) => tasks.find((t) => t.id === id))
        .filter((t) => t?.status === 'complete' && t.resultUrl)
        .map((t) => t!.resultUrl!);
      return completedUrls.length > 0;
    });

    if (validItems.length === 0) return;

    setState('submitting');
    try {
      const payload = validItems.map((item) => ({
        images: item.taskIds
          .map((id) => tasks.find((t) => t.id === id))
          .filter((t) => t?.status === 'complete' && t.resultUrl)
          .map((t) => t!.resultUrl!),
        sellerNotes: item.notes.trim() || undefined,
      }));

      const res = await fetch(`/api/upload/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrorMessage(data.error || 'Something went wrong. Please try again.');
        setState('review');
        return;
      }

      setSubmittedCount(validItems.length);
      setState('success');
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
      setState('review');
    }
  }, [items, tasks, token]);

  // Items with media (for display)
  const itemsWithMedia = items.filter((item) => item.taskIds.length > 0);
  const currentItemHasMedia = items[items.length - 1]?.taskIds.length > 0;
  const totalMediaCount = items.reduce((sum, item) => sum + item.taskIds.length, 0);
  // "Hello, Nathan", not "Hello, Nathan Mayell".
  const firstName = linkData?.prospectName?.trim().split(/\s+/)[0] ?? '';

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
                  setItems([{ taskIds: [], notes: '' }]);
                  setState('capture');
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
      <>
        {errorMessage && (
          <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-2">
            <div className="max-w-xl mx-auto p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              {errorMessage}
              <button
                type="button"
                onClick={() => setErrorMessage('')}
                className="ml-2 text-red-500 font-medium"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        <ReviewScreen
          items={items.filter((item) => item.taskIds.length > 0)}
          tasks={tasks}
          onNotesChange={(idx, notes) => {
            // Map review index back to full items array
            const withMedia = items
              .map((item, i) => ({ item, origIdx: i }))
              .filter(({ item }) => item.taskIds.length > 0);
            if (withMedia[idx]) {
              handleNotesChange(withMedia[idx].origIdx, notes);
            }
          }}
          onBack={() => {
            setErrorMessage('');
            setState('capture');
          }}
          onSubmit={handleSubmit}
          isSubmitting={state === 'submitting'}
          isUploading={isUploading}
          hasErrors={hasErrors}
          onRetryFailed={retryFailed}
        />
      </>
    );
  }

  // ── Capture ──
  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-center py-2 px-4 text-sm flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          You&apos;re offline. Photos will upload when you&apos;re back online.
        </div>
      )}

      <UploadHeader>
        {itemsWithMedia.length > 0 ? (
          <div className="flex items-center gap-3">
            <span className="hidden min-[380px]:inline text-xs text-charcoal/55 tabular-nums">
              {itemsWithMedia.length} {itemsWithMedia.length === 1 ? 'item' : 'items'} &middot;{' '}
              {totalMediaCount} {totalMediaCount === 1 ? 'photo' : 'photos'}
            </span>
            <button
              type="button"
              onClick={() => setState('review')}
              className="flex h-10 items-center gap-1.5 px-4 bg-charcoal text-white text-sm font-medium rounded-lg active:scale-[0.97] transition-transform"
            >
              Review &amp; send
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : undefined}
      </UploadHeader>

      <main className="px-5 pb-48 max-w-xl mx-auto">
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
                Phone photos are perfect.
              </p>
            </div>

            <p className="mt-6 flex items-start gap-2 text-[13px] leading-relaxed text-charcoal/55">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Only you and Mayells specialists can see what you send. Photo location data is removed.
            </p>
          </>
        ) : (
          <div className="pt-5 space-y-4">
            {items.map((item, idx) => {
              // Only items with media are shown; the empty current item is
              // represented by the capture bar.
              if (item.taskIds.length === 0) return null;

              return (
                <ItemCard
                  key={idx}
                  index={idx}
                  taskIds={item.taskIds}
                  tasks={tasks}
                  notes={item.notes}
                  onNotesChange={(notes) => handleNotesChange(idx, notes)}
                  onRemoveMedia={(taskId) => handleRemoveMedia(idx, taskId)}
                  onRemoveItem={() => handleRemoveItem(idx)}
                  canRemove={itemsWithMedia.length > 1 || idx !== 0}
                />
              );
            })}
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
