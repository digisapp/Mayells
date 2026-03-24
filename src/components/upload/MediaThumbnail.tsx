'use client';

import { X, Video, AlertCircle, RotateCcw } from 'lucide-react';
import type { UploadTask } from '@/hooks/useUploadManager';

interface MediaThumbnailProps {
  task: UploadTask;
  onRemove: () => void;
}

export function MediaThumbnail({ task, onRemove }: MediaThumbnailProps) {
  const isUploading = task.status === 'uploading' || task.status === 'compressing';
  const isError = task.status === 'error';
  const isComplete = task.status === 'complete';

  // Create object URL for preview
  const previewUrl = task.isVideo
    ? task.thumbnailUrl || undefined
    : URL.createObjectURL(task.file);

  return (
    <div className="relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-[#272D35]/5">
      {/* Preview image */}
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt=""
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Video className="w-6 h-6 text-[#272D35]/30" />
        </div>
      )}

      {/* Video badge */}
      {task.isVideo && (
        <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1 py-0.5">
          <Video className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Upload progress ring */}
      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="3"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="#D4C5A0"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${task.progress * 0.942} 94.2`}
              className="transition-all duration-300"
            />
          </svg>
          <span className="absolute text-[10px] font-medium text-white">
            {task.progress}%
          </span>
        </div>
      )}

      {/* Error overlay */}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
          <AlertCircle className="w-5 h-5 text-red-500" />
        </div>
      )}

      {/* Compressing indicator */}
      {task.status === 'compressing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <RotateCcw className="w-5 h-5 text-white animate-spin" />
        </div>
      )}

      {/* Remove button */}
      {(isComplete || isError) && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}

      {/* Success checkmark */}
      {isComplete && (
        <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  );
}
