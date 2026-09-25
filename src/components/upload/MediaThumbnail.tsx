'use client';

import Image from 'next/image';
import { X, Video, AlertCircle, Loader2, ImageIcon, WifiOff } from 'lucide-react';
import type { UploadTask } from '@/hooks/useUploadManager';

/**
 * The picture inside a tile. New uploads show a small thumbnail made on the
 * phone; uploads restored after a reload only have their storage URL, so
 * photos go through the image optimizer (a tiny resized copy, not the
 * 2000px original) and videos show a plain placeholder.
 */
export function MediaPreview({ task, size }: { task: UploadTask; size: number }) {
  if (task.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={task.thumbnailUrl} alt="" decoding="async" className="h-full w-full object-cover" />;
  }
  if (task.restored && !task.isVideo && task.resultUrl) {
    return <Image src={task.resultUrl} alt="" fill sizes={`${size}px`} className="object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-charcoal/30">
      {task.isVideo ? <Video className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
    </div>
  );
}

/** Progress, working and failure overlays shared by the capture and review tiles. */
export function MediaStatusOverlay({ task, online }: { task: UploadTask; online: boolean }) {
  if (task.status === 'uploading') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/45">
        <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="#D4C5A0"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${task.progress * 0.942} 94.2`}
            className="motion-safe:transition-all motion-safe:duration-300"
          />
        </svg>
        <span className="absolute text-[11px] font-medium tabular-nums text-white">{task.progress}%</span>
      </div>
    );
  }
  if (task.status === 'compressing' || task.status === 'pending') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/35">
        <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden />
      </div>
    );
  }
  if (task.status === 'error') {
    const waiting = task.failure?.kind === 'network' && !online;
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/35 ring-2 ring-inset ring-red-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
          {waiting ? (
            <WifiOff className="h-4 w-4 text-charcoal/70" aria-hidden />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600" aria-hidden />
          )}
        </span>
      </div>
    );
  }
  return null;
}

interface MediaThumbnailProps {
  task: UploadTask;
  /** 1-based position in its item, for the remove button's label. */
  position: number;
  online: boolean;
  onRemove: () => void;
}

/** A tile on the capture screen. Removable in any state, including mid-upload. */
export function MediaThumbnail({ task, position, online, onRemove }: MediaThumbnailProps) {
  const kind = task.isVideo ? 'video' : 'photo';

  return (
    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-charcoal/5">
      <MediaPreview task={task} size={80} />

      {task.isVideo && task.status !== 'error' && (
        <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5">
          <Video className="h-3 w-3 text-white" aria-hidden />
        </div>
      )}

      <MediaStatusOverlay task={task} online={online} />

      {task.status === 'complete' && (
        <div className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-600">
          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}

      {/* 44px hit area in the corner; the visible disc stays small. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${kind} ${position}`}
        className="absolute right-0 top-0 flex h-11 w-11 items-start justify-end p-1"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60">
          <X className="h-3.5 w-3.5 text-white" aria-hidden />
        </span>
      </button>
    </div>
  );
}
