'use client';

import { ArrowLeft, Send, Loader2, AlertCircle, RotateCcw, Video } from 'lucide-react';
import type { UploadTask } from '@/hooks/useUploadManager';
import { MAX_MEDIA_PER_ITEM, MAX_NOTE_CHARS } from '@/lib/upload/limits';
import { canRetry, sendLabel, summarizeUploads } from '@/lib/upload/upload-queue';
import { UploadHeader } from './UploadHeader';
import { MediaPreview, MediaStatusOverlay } from './MediaThumbnail';
import { UploadFailures } from './UploadFailures';

interface ReviewItem {
  id: string;
  taskIds: string[];
  notes: string;
}

interface ReviewScreenProps {
  items: ReviewItem[];
  tasks: UploadTask[];
  online: boolean;
  onNotesChange: (itemId: string, notes: string) => void;
  onRemoveMedia: (taskId: string) => void;
  onRetryMedia: (taskId: string) => void;
  onRetryFailed: () => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitError: string;
  onDismissError: () => void;
  /** Offline notice, shown under the header. */
  banner?: React.ReactNode;
}

export function ReviewScreen({
  items,
  tasks,
  online,
  onNotesChange,
  onRemoveMedia,
  onRetryMedia,
  onRetryFailed,
  onBack,
  onSubmit,
  isSubmitting,
  submitError,
  onDismissError,
  banner,
}: ReviewScreenProps) {
  const summary = summarizeUploads(items, tasks);
  const label = sendLabel(summary);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const retryable = tasks.some(
    (t) => t.status === 'error' && canRetry(t.failure) && !(t.failure?.kind === 'network' && !online),
  );
  const canSubmit = summary.canSend && !isSubmitting;

  return (
    <div>
      <UploadHeader
        left={
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="-ml-2 flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-charcoal/70 hover:text-charcoal disabled:opacity-40"
          >
            <ArrowLeft className="w-4 h-4" />
            Add more
          </button>
        }
      >
        <span className="font-logo text-[19px] tracking-[0.15em]">MAYELLS</span>
      </UploadHeader>
      {banner}

      <main className="px-5 pt-8 pb-10 max-w-xl mx-auto">
        <h1 className="font-display text-[28px] leading-tight mb-1">Review and send</h1>
        <p className="text-[15px] text-charcoal/60 mb-6">
          {items.length} {items.length === 1 ? 'item' : 'items'} &middot; {summary.totalMedia}{' '}
          {summary.totalMedia === 1 ? 'photo' : 'photos'}. Anything you know about a piece helps our specialists.
        </p>

        {/* Upload progress banner */}
        {summary.activeMedia > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-champagne/10 border border-champagne/25" role="status">
            <div className="flex items-center gap-2 text-sm text-charcoal">
              <Loader2 className="w-4 h-4 animate-spin text-champagne-deep" aria-hidden />
              Uploading&hellip; {summary.completeMedia} of {summary.totalMedia} done
            </div>
            <div className="mt-2 h-1.5 bg-charcoal/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-champagne-deep/70 rounded-full motion-safe:transition-all motion-safe:duration-300"
                style={{ width: `${summary.totalMedia > 0 ? (summary.completeMedia / summary.totalMedia) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Failure summary: the reasons are with each item below. */}
        {summary.failedMedia > 0 && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="flex items-start gap-2 text-[14px] leading-snug text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {summary.failedMedia} {summary.failedMedia === 1 ? 'upload' : 'uploads'} didn&rsquo;t go through; the
                reason is with each one below.
                {summary.sendableItems > 0 ? ' You can still send the rest.' : ''}
              </span>
            </p>
            {retryable && (
              <button
                type="button"
                onClick={onRetryFailed}
                className="-my-1 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium text-red-800 hover:bg-red-100"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Try all again
              </button>
            )}
          </div>
        )}

        {/* Items */}
        <div className="space-y-4">
          {items.map((item, idx) => {
            const itemTasks = item.taskIds.map((id) => byId.get(id)).filter(Boolean) as UploadTask[];
            const overfull = summary.overfullItems.includes(idx);

            return (
              <div key={item.id} className="bg-white rounded-2xl border border-charcoal/10 p-4">
                <span className="text-xs tracking-[0.2em] uppercase text-charcoal/55 font-medium">
                  Item {idx + 1}
                </span>

                {/* Thumbnails grid */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {itemTasks.map((task) => (
                    <div key={task.id} className="relative w-16 h-16 rounded-lg overflow-hidden bg-charcoal/5">
                      <MediaPreview task={task} size={64} />
                      {task.isVideo && task.status === 'complete' && (
                        <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5">
                          <Video className="h-3 w-3 text-white" aria-hidden />
                        </div>
                      )}
                      <MediaStatusOverlay task={task} online={online} />
                    </div>
                  ))}
                </div>

                <UploadFailures tasks={itemTasks} online={online} onRetry={onRetryMedia} onRemove={onRemoveMedia} />

                {overfull && (
                  <p className="mt-3 rounded-xl bg-red-50 p-3 text-[13px] leading-snug text-red-800">
                    One item can have up to {MAX_MEDIA_PER_ITEM} photos. Tap &ldquo;Add more&rdquo; and remove a
                    few from this one.
                  </p>
                )}

                {/* Notes */}
                <textarea
                  value={item.notes}
                  onChange={(e) => onNotesChange(item.id, e.target.value)}
                  maxLength={MAX_NOTE_CHARS}
                  enterKeyHint="enter"
                  autoCapitalize="sentences"
                  aria-label={`Notes for item ${idx + 1}`}
                  placeholder="What is it? Maker, age, size, condition, where it came from…"
                  rows={2}
                  className="mt-3 w-full px-3 py-2.5 text-base lg:text-sm border border-charcoal/10 rounded-xl bg-ivory text-charcoal placeholder:text-charcoal/45 focus:outline-none focus:ring-2 focus:ring-champagne/50 focus:border-champagne transition-colors resize-none"
                />
              </div>
            );
          })}
        </div>

        {/* Submit */}
        <div className="mt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
          {submitError && (
            <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[14px] leading-snug text-red-800">
              <span>{submitError}</span>
              <button
                type="button"
                onClick={onDismissError}
                className="-my-2 -mr-1 inline-flex h-11 shrink-0 items-center px-2 font-medium text-red-700"
              >
                Dismiss
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="w-full min-h-14 flex items-center justify-center gap-2.5 px-4 py-3 bg-charcoal text-white text-[15px] font-medium rounded-xl hover:bg-charcoal/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed motion-safe:active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                Sending…
              </>
            ) : (
              <>
                <Send className="w-4 h-4 shrink-0" aria-hidden />
                <span>
                  {label.primary}
                  {label.secondary && (
                    <span className="font-normal text-white/70"> &middot; {label.secondary}</span>
                  )}
                </span>
              </>
            )}
          </button>

          {summary.activeMedia > 0 && (
            <p className="text-center text-[13px] text-charcoal/55 mt-3">
              Send will be ready when your uploads finish.
            </p>
          )}
          {summary.activeMedia === 0 && summary.failedMedia > 0 && summary.sendableItems > 0 && (
            <p className="text-center text-[13px] text-charcoal/55 mt-3">
              Anything that couldn&rsquo;t upload is left out.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
