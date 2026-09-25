'use client';

import { X } from 'lucide-react';
import { MediaThumbnail } from './MediaThumbnail';
import { UploadFailures } from './UploadFailures';
import type { UploadTask } from '@/hooks/useUploadManager';
import { MAX_NOTE_CHARS } from '@/lib/upload/limits';

interface ItemCardProps {
  index: number;
  taskIds: string[];
  tasks: UploadTask[];
  notes: string;
  online: boolean;
  onNotesChange: (notes: string) => void;
  onRemoveMedia: (taskId: string) => void;
  onRetryMedia: (taskId: string) => void;
  onRemoveItem: () => void;
  canRemove: boolean;
}

export function ItemCard({
  index,
  taskIds,
  tasks,
  notes,
  online,
  onNotesChange,
  onRemoveMedia,
  onRetryMedia,
  onRemoveItem,
  canRemove,
}: ItemCardProps) {
  const itemTasks = taskIds.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as UploadTask[];

  return (
    <div className="bg-white rounded-2xl border border-charcoal/10 p-4 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs tracking-[0.2em] uppercase text-charcoal/55 font-medium">
          Item {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemoveItem}
            aria-label={`Remove item ${index + 1}`}
            className="w-11 h-11 -mr-2.5 -my-1.5 rounded-full flex items-center justify-center text-charcoal/45 hover:text-charcoal/80 hover:bg-charcoal/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Media thumbnails - horizontal scroll */}
      {itemTasks.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {itemTasks.map((task, i) => (
            <MediaThumbnail
              key={task.id}
              task={task}
              position={i + 1}
              online={online}
              onRemove={() => onRemoveMedia(task.id)}
            />
          ))}
        </div>
      )}

      <UploadFailures tasks={itemTasks} online={online} onRetry={onRetryMedia} onRemove={onRemoveMedia} />

      {/* Notes input */}
      <input
        type="text"
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        onKeyDown={(e) => {
          // "Done" on the keyboard: close it rather than submit anything.
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        maxLength={MAX_NOTE_CHARS}
        enterKeyHint="done"
        autoComplete="off"
        autoCapitalize="sentences"
        aria-label={`Notes for item ${index + 1}`}
        placeholder="What is it? Maker, age, history (optional)"
        className="mt-3 w-full px-3 py-2.5 text-base lg:text-sm border border-charcoal/10 rounded-xl bg-ivory text-charcoal placeholder:text-charcoal/45 focus:outline-none focus:ring-2 focus:ring-champagne/50 focus:border-champagne transition-colors"
      />
    </div>
  );
}
