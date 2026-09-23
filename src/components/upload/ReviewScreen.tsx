'use client';

import { useEffect, useMemo } from 'react';
import { ArrowLeft, Send, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import type { UploadTask } from '@/hooks/useUploadManager';
import { UploadHeader } from './UploadHeader';

// Create an object URL once per file and revoke it on cleanup — creating one
// in the render body leaks a new URL on every render (e.g. notes keystrokes).
function usePreviewUrl(file: File) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}

function PhotoPreview({ file }: { file: File }) {
  const url = usePreviewUrl(file);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="w-full h-full object-cover" />;
}

interface ReviewItem {
  taskIds: string[];
  notes: string;
}

interface ReviewScreenProps {
  items: ReviewItem[];
  tasks: UploadTask[];
  onNotesChange: (itemIndex: number, notes: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  isUploading: boolean;
  hasErrors: boolean;
  onRetryFailed: () => void;
}

export function ReviewScreen({
  items,
  tasks,
  onNotesChange,
  onBack,
  onSubmit,
  isSubmitting,
  isUploading,
  hasErrors,
  onRetryFailed,
}: ReviewScreenProps) {
  const totalMedia = items.reduce((sum, item) => sum + item.taskIds.length, 0);
  const completedMedia = items.reduce(
    (sum, item) =>
      sum +
      item.taskIds.filter((id) => {
        const task = tasks.find((t) => t.id === id);
        return task?.status === 'complete';
      }).length,
    0
  );

  const allComplete = completedMedia === totalMedia && !isUploading;
  const canSubmit = allComplete && !isSubmitting && !hasErrors;

  return (
    <div>
      <UploadHeader
        left={
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-charcoal/70 hover:text-charcoal"
          >
            <ArrowLeft className="w-4 h-4" />
            Add more
          </button>
        }
      >
        <span className="font-logo text-[19px] tracking-[0.15em]">MAYELLS</span>
      </UploadHeader>

      <main className="px-5 pt-8 pb-10 max-w-xl mx-auto">
        <h1 className="font-display text-[28px] leading-tight mb-1">Review and send</h1>
        <p className="text-[15px] text-charcoal/60 mb-6">
          {items.length} {items.length === 1 ? 'item' : 'items'} &middot; {totalMedia} {totalMedia === 1 ? 'photo' : 'photos'}. Anything you know about a piece helps our specialists.
        </p>

        {/* Upload progress banner */}
        {isUploading && (
          <div className="mb-4 p-3 rounded-xl bg-champagne/10 border border-champagne/20">
            <div className="flex items-center gap-2 text-sm text-charcoal">
              <Loader2 className="w-4 h-4 animate-spin text-champagne" />
              Uploading... {completedMedia}/{totalMedia} complete
            </div>
            <div className="mt-2 h-1.5 bg-charcoal/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-champagne rounded-full transition-all duration-300"
                style={{ width: `${totalMedia > 0 ? (completedMedia / totalMedia) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Error banner */}
        {hasErrors && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4" />
                Some uploads failed
              </div>
              <button
                type="button"
                onClick={onRetryFailed}
                className="flex items-center gap-1 text-sm text-red-700 font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Items */}
        <div className="space-y-4">
          {items.map((item, idx) => {
            const itemTasks = item.taskIds
              .map((id) => tasks.find((t) => t.id === id))
              .filter(Boolean) as UploadTask[];

            return (
              <div key={idx} className="bg-white rounded-2xl border border-charcoal/10 p-4">
                <span className="text-xs tracking-[0.2em] uppercase text-charcoal/40 font-medium">
                  Item {idx + 1}
                </span>

                {/* Thumbnails grid */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {itemTasks.map((task) => (
                    <div key={task.id} className="w-16 h-16 rounded-lg overflow-hidden bg-charcoal/5">
                      {task.isVideo ? (
                        task.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={task.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-charcoal/30 text-[10px]">
                            VID
                          </div>
                        )
                      ) : (
                        <PhotoPreview file={task.file} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Notes */}
                <textarea
                  value={item.notes}
                  onChange={(e) => onNotesChange(idx, e.target.value)}
                  placeholder="What is it? Maker, age, size, condition, where it came from…"
                  rows={2}
                  className="mt-3 w-full px-3 py-2.5 text-base sm:text-sm border border-charcoal/10 rounded-xl bg-ivory text-charcoal placeholder:text-charcoal/30 focus:outline-none focus:ring-2 focus:ring-champagne/50 focus:border-champagne transition-colors resize-none"
                />
              </div>
            );
          })}
        </div>

        {/* Submit button */}
        <div className="mt-8 pb-8">
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2.5 py-4 bg-charcoal text-white text-[15px] font-medium rounded-xl hover:bg-charcoal/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send {items.length} {items.length === 1 ? 'item' : 'items'} to Mayells
              </>
            )}
          </button>

          {!allComplete && !hasErrors && (
            <p className="text-center text-xs text-charcoal/40 mt-3">
              Finishing your uploads…
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
