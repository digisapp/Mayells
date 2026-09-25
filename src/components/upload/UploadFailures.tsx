'use client';

import { RotateCcw, Trash2 } from 'lucide-react';
import type { UploadTask } from '@/hooks/useUploadManager';
import { canRetry, describeFailure } from '@/lib/upload/upload-queue';
import { MediaPreview } from './MediaThumbnail';

interface UploadFailuresProps {
  tasks: UploadTask[];
  online: boolean;
  onRetry: (taskId: string) => void;
  onRemove: (taskId: string) => void;
}

/**
 * Each photo or video in an item that didn't upload, with the reason in
 * plain words and what the seller can do about it. Shown under the item on
 * both the capture and review screens, so a problem (say, a video that's
 * too long) is explained while the camera is still in hand.
 */
export function UploadFailures({ tasks, online, onRetry, onRemove }: UploadFailuresProps) {
  const failed = tasks.filter((t) => t.status === 'error' && t.failure);
  if (failed.length === 0) return null;

  return (
    <ul className="mt-3 space-y-2">
      {failed.map((task) => {
        const kind = task.isVideo ? 'video' : 'photo';
        const waiting = task.failure!.kind === 'network' && !online;
        return (
          <li
            key={task.id}
            className={`flex gap-3 rounded-xl p-3 ${waiting ? 'bg-charcoal/[0.04]' : 'bg-red-50'}`}
          >
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-charcoal/5">
              <MediaPreview task={task} size={48} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] font-medium ${waiting ? 'text-charcoal' : 'text-red-800'}`}>
                {waiting ? 'Waiting for a connection' : `This ${kind} couldn’t upload`}
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-charcoal/70">
                {describeFailure(task.failure!, { online, durationSec: task.duration })}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {canRetry(task.failure) && !waiting && (
                  <button
                    type="button"
                    onClick={() => onRetry(task.id)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-charcoal/15 bg-white px-3 text-[14px] font-medium text-charcoal"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Try again
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(task.id)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-charcoal/70 hover:text-charcoal"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Remove
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
