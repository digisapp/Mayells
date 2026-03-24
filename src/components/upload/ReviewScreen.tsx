'use client';

import { ArrowLeft, Send, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import type { UploadTask } from '@/hooks/useUploadManager';

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
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-[#272D35]/10 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-[#272D35]/60"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <span className="text-xs tracking-[0.2em] uppercase text-[#272D35]/40 font-medium">
            Review
          </span>
          <div className="w-14" /> {/* Spacer for centering */}
        </div>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto">
        <h2 className="font-serif text-xl text-[#272D35] mb-1">Review Your Items</h2>
        <p className="text-sm text-[#272D35]/50 mb-6">
          {items.length} {items.length === 1 ? 'item' : 'items'} &middot; {totalMedia} {totalMedia === 1 ? 'photo/video' : 'photos/videos'}
        </p>

        {/* Upload progress banner */}
        {isUploading && (
          <div className="mb-4 p-3 rounded-xl bg-[#D4C5A0]/10 border border-[#D4C5A0]/20">
            <div className="flex items-center gap-2 text-sm text-[#272D35]">
              <Loader2 className="w-4 h-4 animate-spin text-[#D4C5A0]" />
              Uploading... {completedMedia}/{totalMedia} complete
            </div>
            <div className="mt-2 h-1.5 bg-[#272D35]/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#D4C5A0] rounded-full transition-all duration-300"
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
              <div key={idx} className="bg-white rounded-2xl border border-[#272D35]/10 p-4">
                <span className="text-xs tracking-[0.2em] uppercase text-[#272D35]/40 font-medium">
                  Item {idx + 1}
                </span>

                {/* Thumbnails grid */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {itemTasks.map((task) => (
                    <div key={task.id} className="w-16 h-16 rounded-lg overflow-hidden bg-[#272D35]/5">
                      {task.isVideo ? (
                        task.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={task.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#272D35]/30 text-[10px]">
                            VID
                          </div>
                        )
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={URL.createObjectURL(task.file)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Notes */}
                <textarea
                  value={item.notes}
                  onChange={(e) => onNotesChange(idx, e.target.value)}
                  placeholder="Add details: history, condition, provenance, dimensions..."
                  rows={2}
                  className="mt-3 w-full px-3 py-2.5 text-sm border border-[#272D35]/10 rounded-xl bg-[#FAFAF8] text-[#272D35] placeholder:text-[#272D35]/30 focus:outline-none focus:ring-2 focus:ring-[#D4C5A0]/50 focus:border-[#D4C5A0] transition-colors resize-none"
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
            className="w-full flex items-center justify-center gap-2.5 py-4 bg-[#272D35] text-white text-sm font-medium tracking-wide rounded-xl hover:bg-[#1e2329] transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit {items.length} {items.length === 1 ? 'Item' : 'Items'}
              </>
            )}
          </button>

          {!allComplete && !hasErrors && (
            <p className="text-center text-xs text-[#272D35]/40 mt-3">
              Waiting for uploads to finish...
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
