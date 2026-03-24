'use client';

import { X } from 'lucide-react';
import { MediaThumbnail } from './MediaThumbnail';
import type { UploadTask } from '@/hooks/useUploadManager';

interface ItemCardProps {
  index: number;
  taskIds: string[];
  tasks: UploadTask[];
  notes: string;
  onNotesChange: (notes: string) => void;
  onRemoveMedia: (taskId: string) => void;
  onRemoveItem: () => void;
  canRemove: boolean;
}

export function ItemCard({
  index,
  taskIds,
  tasks,
  notes,
  onNotesChange,
  onRemoveMedia,
  onRemoveItem,
  canRemove,
}: ItemCardProps) {
  const itemTasks = taskIds.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as UploadTask[];

  return (
    <div className="bg-white rounded-2xl border border-[#272D35]/10 p-4 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs tracking-[0.2em] uppercase text-[#272D35]/40 font-medium">
          Item {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemoveItem}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[#272D35]/30 hover:text-[#272D35]/70 hover:bg-[#272D35]/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Media thumbnails - horizontal scroll */}
      {itemTasks.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {itemTasks.map((task) => (
            <MediaThumbnail
              key={task.id}
              task={task}
              onRemove={() => onRemoveMedia(task.id)}
            />
          ))}
        </div>
      )}

      {/* Notes input */}
      <input
        type="text"
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Add a note about this item (optional)"
        className="mt-3 w-full px-3 py-2.5 text-sm border border-[#272D35]/10 rounded-xl bg-[#FAFAF8] text-[#272D35] placeholder:text-[#272D35]/30 focus:outline-none focus:ring-2 focus:ring-[#D4C5A0]/50 focus:border-[#D4C5A0] transition-colors"
      />
    </div>
  );
}
