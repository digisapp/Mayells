'use client';

import { useRef } from 'react';
import { Camera, Video, Images, Plus } from 'lucide-react';

interface CaptureBarProps {
  onFilesSelected: (files: File[]) => void;
  onNextItem: () => void;
  hasCurrentItemMedia: boolean;
  /** 1-based number of the item photos are currently going into. */
  itemNumber: number;
}

/**
 * Fixed bottom bar for adding photos. Phones get the camera first (Photo,
 * Video) with the library beside it; a computer, which has no camera to
 * open, gets a single "Choose photos" button instead. Switched on pointer
 * type rather than width, so a large phone or a tablet still gets the camera.
 */
export function CaptureBar({ onFilesSelected, onNextItem, hasCurrentItemMedia, itemNumber }: CaptureBarProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files);
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const button =
    'flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-medium active:scale-[0.97] transition-transform';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-charcoal/10 bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handleFiles} className="hidden" />
      <input ref={videoInputRef} type="file" accept="video/*" capture="environment" onChange={handleFiles} className="hidden" />
      <input ref={libraryInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFiles} className="hidden" />

      <div className="mx-auto max-w-xl px-4 pt-3">
        <p className="mb-2 text-center text-[12px] font-medium uppercase tracking-[0.15em] text-charcoal/45">
          {hasCurrentItemMedia ? `Adding to item ${itemNumber}` : `Item ${itemNumber}`}
        </p>

        {/* Touch devices: camera first */}
        <div className="flex gap-2 [@media(pointer:fine)]:hidden">
          <button type="button" onClick={() => photoInputRef.current?.click()} className={`${button} bg-charcoal text-white`}>
            <Camera className="h-5 w-5" />
            Photo
          </button>
          <button type="button" onClick={() => videoInputRef.current?.click()} className={`${button} bg-charcoal text-white`}>
            <Video className="h-5 w-5" />
            Video
          </button>
          <button type="button" onClick={() => libraryInputRef.current?.click()} className={`${button} border border-charcoal/15 bg-white`}>
            <Images className="h-5 w-5" />
            Library
          </button>
        </div>

        {/* Computers: no camera to open, so one file picker */}
        <div className="hidden [@media(pointer:fine)]:flex">
          <button type="button" onClick={() => libraryInputRef.current?.click()} className={`${button} bg-charcoal text-white`}>
            <Images className="h-5 w-5" />
            Choose photos or videos
          </button>
        </div>

        {hasCurrentItemMedia && (
          <button
            type="button"
            onClick={onNextItem}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-champagne-deep/40 text-[15px] font-medium text-champagne-deep active:scale-[0.97] transition-transform"
          >
            <Plus className="h-4 w-4" />
            Next item
          </button>
        )}
      </div>
    </div>
  );
}
