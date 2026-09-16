'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { ADMIN_UPLOAD_ACCEPT, uploadImageAsAdmin } from '@/lib/upload/admin-upload';

interface UploadImagesButtonProps {
  /** Receives the public URL of every photo that made it, in pick order. */
  onUploaded: (urls: string[]) => void;
  disabled?: boolean;
}

/**
 * "Upload photos" affordance for the AI tool tabs: uploads straight to
 * storage via the admin signed-URL flow and hands back public URLs, so staff
 * no longer need to hunt for a hosted image URL to paste in.
 */
export function UploadImagesButton({ onUploaded, disabled }: UploadImagesButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;

    setProgress({ current: 0, total: files.length });
    const urls: string[] = [];
    const failed: string[] = [];
    // One failure must not abort the run — the rest still land.
    for (const [i, file] of files.entries()) {
      setProgress({ current: i + 1, total: files.length });
      try {
        const { url } = await uploadImageAsAdmin(file);
        urls.push(url);
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`);
      }
    }
    setProgress(null);

    if (urls.length > 0) onUploaded(urls);
    for (const f of failed) toast.error(f);
    if (urls.length > 0 && failed.length === 0) {
      toast.success(`${urls.length} photo${urls.length === 1 ? '' : 's'} uploaded`);
    }
  }

  const busy = progress !== null;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ADMIN_UPLOAD_ACCEPT}
        multiple
        onChange={handleSelect}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        className="gap-1.5"
      >
        {busy ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading {progress.current} of {progress.total}…</>
        ) : (
          <><Upload className="h-3.5 w-3.5" /> Upload photos</>
        )}
      </Button>
    </>
  );
}
