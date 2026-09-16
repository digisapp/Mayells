'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, X, AlertCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
// Validating up front means the admin sees what will be skipped before a
// single byte is sent, instead of one opaque failure mid-run. The allow-list
// mirrors /api/upload/signed-url (JPEG, PNG, WebP, AVIF, HEIC; 15 MB).
import {
  ADMIN_UPLOAD_ACCEPT as UPLOAD_ACCEPT,
  validateAdminUploadFile as validateUploadFile,
  uploadImageAsAdmin,
} from '@/lib/upload/admin-upload';

interface Picked {
  file: File;
  preview: string;
}

interface Rejected {
  name: string;
  reason: string;
}

export interface PhotoUploadResult {
  uploaded: number;
  failed: string[];
  created: number;
}

interface PhotoUploadPanelProps {
  visitId: string;
  /** Called after the items are created; failures are listed but never abort the run. */
  onComplete: (result: PhotoUploadResult) => void | Promise<void>;
  ctaLabel?: string;
}

/**
 * Pick → validate → upload each file → create the visit's items. Shared by
 * the new-visit flow and the detail page's "Add photos" panel so both use the
 * same direct-to-storage upload → POST items path.
 */
export function PhotoUploadPanel({ visitId, onComplete, ctaLabel = 'Upload & Start AI Analysis' }: PhotoUploadPanelProps) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  // Release preview object URLs when the panel unmounts.
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  useEffect(() => () => pickedRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const ok: Picked[] = [];
    const bad: Rejected[] = [];
    for (const file of files) {
      const reason = validateUploadFile(file);
      if (reason) bad.push({ name: file.name, reason });
      else ok.push({ file, preview: URL.createObjectURL(file) });
    }
    setPicked((prev) => [...prev, ...ok]);
    setRejected((prev) => [...prev, ...bad]);
    if (bad.length > 0) {
      toast.error(`${bad.length} file${bad.length !== 1 ? 's' : ''} skipped — see the list below`);
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  function removePicked(index: number) {
    setPicked((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleUpload() {
    if (picked.length === 0 || uploading) return;
    setUploading(true);
    setFailures([]);
    setProgress({ current: 0, total: picked.length });

    const urls: string[] = [];
    const failed: string[] = [];

    try {
      // One failure must not abort the run — the rest still land.
      for (let i = 0; i < picked.length; i++) {
        setProgress({ current: i + 1, total: picked.length });
        const { file } = picked[i];
        try {
          // Straight to storage via a signed URL — a 12 MB phone photo would
          // trip Vercel's request-body cap if it went through /api/upload.
          const { url } = await uploadImageAsAdmin(file);
          urls.push(url);
        } catch (err) {
          failed.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`);
        }
      }
      setFailures(failed);

      if (urls.length === 0) {
        toast.error('No photos were uploaded');
        return;
      }

      const itemsRes = await fetch(`/api/admin/appraisals/${visitId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: urls }),
      });
      const itemsJson = await itemsRes.json().catch(() => ({}));
      if (!itemsRes.ok) {
        toast.error(itemsJson.error || 'Photos uploaded but items could not be created');
        return;
      }
      const created = Array.isArray(itemsJson.data) ? itemsJson.data.length : urls.length;
      toast.success(
        `${created} photo${created !== 1 ? 's' : ''} added${failed.length ? ` — ${failed.length} failed` : ''}`,
      );

      picked.forEach((p) => URL.revokeObjectURL(p.preview));
      setPicked([]);
      setRejected([]);
      await onComplete({ uploaded: urls.length, failed, created });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        onChange={handleSelect}
        className="hidden"
      />

      {picked.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {picked.map((p, i) => (
            <div key={p.preview} className="relative group aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail / local file preview */}
              <img
                src={p.preview}
                alt={p.file.name}
                className="w-full h-full object-cover rounded-lg border"
              />
              {!uploading && (
                <button
                  type="button"
                  onClick={() => removePicked(i)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  aria-label={`Remove ${p.file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/20 hover:border-champagne/50 rounded-xl px-4 py-8 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        <Upload className="h-5 w-5" />
        {picked.length > 0
          ? `${picked.length} photo${picked.length !== 1 ? 's' : ''} selected — tap to add more`
          : 'Tap to select photos'}
      </button>
      <p className="text-[11px] text-muted-foreground -mt-2">
        JPEG, PNG, WebP, AVIF, or HEIC up to 15 MB each. Photos upload straight to storage, so full-size phone shots are fine; iOS hands over JPEGs when picked here.
      </p>

      {rejected.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
          <p className="font-medium flex items-center gap-1 mb-1">
            <AlertCircle className="h-3.5 w-3.5" /> {rejected.length} file{rejected.length !== 1 ? 's' : ''} will be skipped
          </p>
          <ul className="space-y-0.5">
            {rejected.map((r, i) => (
              <li key={`${r.name}-${i}`} className="truncate">
                <span className="font-medium">{r.name}</span> — {r.reason}
              </li>
            ))}
          </ul>
          <button type="button" className="underline mt-1" onClick={() => setRejected([])}>
            Dismiss
          </button>
        </div>
      )}

      {failures.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <p className="font-medium flex items-center gap-1 mb-1">
            <AlertCircle className="h-3.5 w-3.5" /> {failures.length} upload{failures.length !== 1 ? 's' : ''} failed
          </p>
          <ul className="space-y-0.5">
            {failures.map((f, i) => (
              <li key={i} className="truncate">{f}</li>
            ))}
          </ul>
        </div>
      )}

      {uploading && (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-champagne" />
            <span className="text-sm font-medium">
              Uploading {progress.current} of {progress.total}…
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-champagne h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <Button
        onClick={handleUpload}
        disabled={picked.length === 0 || uploading}
        className="w-full bg-champagne text-charcoal hover:bg-champagne/90"
        size="lg"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Uploading…
          </>
        ) : (
          <>
            <ArrowRight className="h-4 w-4 mr-2" />
            {picked.length > 0 ? `${ctaLabel} (${picked.length})` : ctaLabel}
          </>
        )}
      </Button>
    </div>
  );
}
