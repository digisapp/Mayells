'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, X, Check, WifiOff, ArrowRight } from 'lucide-react';
import { useUploadManager } from '@/hooks/useUploadManager';
import { CaptureBar } from '@/components/upload/CaptureBar';
import { ItemCard } from '@/components/upload/ItemCard';
import { ReviewScreen } from '@/components/upload/ReviewScreen';
import { PWAInstallPrompt } from '@/components/upload/PWAInstallPrompt';

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

export default function UploadPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [items, setItems] = useState<CaptureItem[]>([{ taskIds: [], notes: '' }]);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

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

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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

  // ── Loading ──
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#D4C5A0] mx-auto mb-4" />
          <p className="text-[#272D35]/60 text-sm tracking-wide">Validating your link...</p>
        </div>
      </div>
    );
  }

  // ── Invalid ──
  if (state === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8] px-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-[#272D35]/5 flex items-center justify-center mx-auto mb-6">
            <X className="h-8 w-8 text-[#272D35]/40" />
          </div>
          <h1 className="font-serif text-2xl text-[#272D35] mb-3">Link Unavailable</h1>
          <p className="text-[#272D35]/60 leading-relaxed">
            This upload link is invalid or has expired. Please contact Mayell for a new link.
          </p>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (state === 'success') {
    return (
      <div className="min-h-screen bg-[#FAFAF8] px-4 pt-20">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 rounded-full bg-[#D4C5A0]/20 flex items-center justify-center mx-auto mb-6">
            <Check className="h-8 w-8 text-[#D4C5A0]" />
          </div>
          <h1 className="font-serif text-2xl text-[#272D35] mb-3">Thank You</h1>
          <p className="text-[#272D35]/60 leading-relaxed">
            We&apos;ve received your {submittedCount} {submittedCount === 1 ? 'item' : 'items'}. Our
            team will review them and reach out within 1&ndash;2 business days.
          </p>
          <PWAInstallPrompt />
        </div>
      </div>
    );
  }

  // ── Review ──
  if (state === 'review' || state === 'submitting') {
    return (
      <>
        {errorMessage && (
          <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-2">
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
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
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-center py-2 px-4 text-sm flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          You&apos;re offline. Photos will upload when you&apos;re back online.
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-[#272D35]/10 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-xs tracking-[0.35em] uppercase text-[#D4C5A0] font-medium">
            MAYELL
          </p>
          <div className="flex items-center gap-3">
            {totalMediaCount > 0 && (
              <span className="text-xs text-[#272D35]/50">
                {itemsWithMedia.length} {itemsWithMedia.length === 1 ? 'item' : 'items'} &middot;{' '}
                {totalMediaCount} {totalMediaCount === 1 ? 'photo' : 'photos'}
              </span>
            )}
            {itemsWithMedia.length > 0 && (
              <button
                type="button"
                onClick={() => setState('review')}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#272D35] text-white text-xs font-medium rounded-lg active:scale-[0.97] transition-transform"
              >
                Done
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Welcome message when empty */}
      {totalMediaCount === 0 && (
        <div className="px-6 pt-12 pb-6 text-center">
          <h1 className="font-serif text-2xl text-[#272D35] mb-2">
            Hello{linkData?.prospectName ? `, ${linkData.prospectName}` : ''}
          </h1>
          <p className="text-[#272D35]/50 text-sm leading-relaxed max-w-xs mx-auto">
            Take photos and videos of items you&apos;d like to consign. You can capture multiple angles per item.
          </p>
          {linkData?.maxItems && (
            <p className="text-xs text-[#D4C5A0] mt-3">
              Up to {linkData.maxItems - linkData.itemCount} items remaining
            </p>
          )}
        </div>
      )}

      {/* Item cards */}
      <main
        className="px-4 pb-44"
        style={{ paddingTop: totalMediaCount === 0 ? '0' : '1rem' }}
      >
        {totalMediaCount > 0 && linkData?.prospectName && (
          <p className="text-[#272D35]/40 text-xs mb-4">
            Uploading for {linkData.prospectName}
          </p>
        )}

        <div className="space-y-4">
          {items.map((item, idx) => {
            // Only show items that have media or are the current (last) item
            if (item.taskIds.length === 0 && idx !== items.length - 1) return null;
            if (item.taskIds.length === 0) return null; // Don't show empty current item

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
        </div>

        {/* Empty state hint */}
        {totalMediaCount === 0 && (
          <div className="mt-4 text-center">
            <div className="inline-flex items-center gap-2 text-[#272D35]/30 text-sm">
              <span>&darr;</span> Use the buttons below to get started <span>&darr;</span>
            </div>
          </div>
        )}
      </main>

      {/* Bottom capture bar */}
      <CaptureBar
        onFilesSelected={handleFilesSelected}
        onNextItem={handleNextItem}
        hasCurrentItemMedia={currentItemHasMedia}
      />
    </div>
  );
}
