'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatBytes, MAX_ATTACHMENT_BYTES, type AttachmentLink, type OutgoingAttachment } from './types';

/** Read files into base64, enforcing the total-size cap across the set. */
export function readFilesInto(
  e: React.ChangeEvent<HTMLInputElement>,
  existing: OutgoingAttachment[],
  setter: React.Dispatch<React.SetStateAction<OutgoingAttachment[]>>,
) {
  const files = e.target.files;
  e.target.value = '';
  if (!files) return;
  let total = existing.reduce((sum, a) => sum + a.size, 0);
  for (const file of Array.from(files)) {
    if (total + file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(`"${file.name}" would push attachments over the 3 MB limit (${formatBytes(total)} attached).`);
      continue;
    }
    total += file.size;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setter((prev) => [...prev, {
        content: base64,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      }]);
    };
    reader.readAsDataURL(file);
  }
}

export function AttachmentChips({
  items, onRemove,
}: { items: OutgoingAttachment[]; onRemove: (index: number) => void }) {
  if (items.length === 0) return null;
  const total = items.reduce((s, a) => s + a.size, 0);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((a, i) => (
        <div key={i} className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
          <Paperclip className="h-3 w-3 text-muted-foreground" />
          <span className="max-w-[150px] truncate">{a.filename}</span>
          <span className="text-muted-foreground">{formatBytes(a.size)}</span>
          <button type="button" onClick={() => onRemove(i)} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${a.filename}`}>
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <span className="text-[11px] text-muted-foreground">{formatBytes(total)} of 3 MB</span>
    </div>
  );
}

/** Full-screen viewer for image attachments: large view, prev/next, download. */
function AttachmentLightbox({
  images, index, onClose, onNavigate,
}: {
  images: AttachmentLink[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const image = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(index - 1);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(index + 1);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, hasPrev, hasNext, onClose, onNavigate]);

  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={image.filename}
    >
      <div className="flex items-center justify-between gap-3 p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="truncate text-sm">
          {image.filename}
          <span className="ml-2 text-xs text-white/60">
            {formatBytes(image.size)}{images.length > 1 ? ` · ${index + 1} of ${images.length}` : ''}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={image.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
          <button onClick={onClose} className="rounded-md bg-white/10 p-1.5 transition-colors hover:bg-white/20" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {hasPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }}
            className="absolute left-3 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.downloadUrl}
          alt={image.filename}
          className="max-h-full max-w-full rounded-md object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {hasNext && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }}
            className="absolute right-3 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            aria-label="Next image"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Attachments of an inbound email. Files live on Resend behind expiring
 * signed URLs, so this fetches fresh links every time it mounts.
 */
export function EmailAttachments({ emailId }: { emailId: string }) {
  const [items, setItems] = useState<AttachmentLink[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/emails/${emailId}/attachments`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!cancelled) setItems(d.data ?? []); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [emailId]);

  if (failed) {
    return <p className="mt-3 text-xs text-red-600">Could not load attachments.</p>;
  }
  if (items === null) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Paperclip className="h-3 w-3 animate-pulse" />
        Loading attachments…
      </div>
    );
  }
  if (items.length === 0) return null;

  const images = items.filter((a) => a.contentType.startsWith('image/'));
  const files = items.filter((a) => !a.contentType.startsWith('image/'));

  return (
    <div className="mt-3 space-y-2">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Paperclip className="h-3 w-3" />
        {items.length} attachment{items.length > 1 ? 's' : ''}
      </p>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}
              className="group relative block cursor-zoom-in"
              title={`${a.filename} (${formatBytes(a.size)}) — click to view`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.downloadUrl}
                alt={a.filename}
                className="h-28 w-28 rounded-md border border-border object-cover transition-opacity group-hover:opacity-90"
              />
              <span className="absolute inset-x-0 bottom-0 truncate rounded-b-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                {a.filename}
              </span>
            </button>
          ))}
        </div>
      )}
      {lightboxIndex !== null && (
        <AttachmentLightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
      {files.map((a) => (
        <a
          key={a.id}
          href={a.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-2 text-sm text-champagne hover:underline"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {a.filename}
          <span className="text-xs text-muted-foreground">({formatBytes(a.size)})</span>
        </a>
      ))}
    </div>
  );
}
