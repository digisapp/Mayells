'use client';

import { useRef } from 'react';
import { Camera, Video, ImagePlus, Plus } from 'lucide-react';

interface CaptureBarProps {
  onFilesSelected: (files: File[]) => void;
  onNextItem: () => void;
  hasCurrentItemMedia: boolean;
}

export function CaptureBar({ onFilesSelected, onNextItem, hasCurrentItemMedia }: CaptureBarProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesSelected(files);
      // Try haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#272D35]/10 z-50"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      {/* Hidden file inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFiles}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={handleFiles}
        className="hidden"
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleFiles}
        className="hidden"
      />

      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          {/* Take Photo */}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[#272D35] text-white rounded-xl font-medium text-sm active:scale-[0.97] transition-transform"
          >
            <Camera className="w-5 h-5" />
            Photo
          </button>

          {/* Take Video */}
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[#272D35] text-white rounded-xl font-medium text-sm active:scale-[0.97] transition-transform"
          >
            <Video className="w-5 h-5" />
            Video
          </button>

          {/* Choose from Library */}
          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            className="flex items-center justify-center w-12 h-12 bg-[#272D35]/5 text-[#272D35] rounded-xl active:scale-[0.97] transition-transform"
          >
            <ImagePlus className="w-5 h-5" />
          </button>
        </div>

        {/* Next Item button - only shows when current item has media */}
        {hasCurrentItemMedia && (
          <button
            type="button"
            onClick={onNextItem}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-[#D4C5A0]/50 text-[#D4C5A0] rounded-xl text-sm font-medium active:scale-[0.97] transition-transform"
          >
            <Plus className="w-4 h-4" />
            Next Item
          </button>
        )}
      </div>
    </div>
  );
}
