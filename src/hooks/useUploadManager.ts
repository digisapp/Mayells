'use client';

import { useState, useCallback, useRef } from 'react';
import { compressImage } from '@/lib/upload/compress-image';
import { generateVideoThumbnail } from '@/lib/upload/video-thumbnail';

export interface UploadTask {
  id: string;
  file: File;
  status: 'pending' | 'compressing' | 'uploading' | 'complete' | 'error';
  progress: number;
  resultUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  retryCount: number;
  isVideo: boolean;
}

const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;

const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

export function useUploadManager(token: string) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const activeCountRef = useRef(0);
  const queueRef = useRef<string[]>([]);

  const updateTask = useCallback((id: string, updates: Partial<UploadTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const processNext = useCallback(() => {
    if (activeCountRef.current >= MAX_CONCURRENT || queueRef.current.length === 0) return;

    const taskId = queueRef.current.shift()!;
    activeCountRef.current++;

    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId);
      if (!task || task.status === 'complete') {
        activeCountRef.current--;
        return prev;
      }
      processTask(task);
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const processTask = useCallback(
    async (task: UploadTask) => {
      try {
        let fileToUpload = task.file;
        const isVideo = VIDEO_TYPES.includes(task.file.type);

        // Compress images (not videos)
        if (!isVideo) {
          updateTask(task.id, { status: 'compressing' });
          fileToUpload = await compressImage(task.file);
        }

        updateTask(task.id, { status: 'uploading', progress: 0 });

        // Step 1: Get signed URL
        const signedRes = await fetch(`/api/upload/${token}/signed-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: fileToUpload.name,
            contentType: fileToUpload.type,
            fileSize: fileToUpload.size,
          }),
        });

        if (!signedRes.ok) {
          const err = await signedRes.json();
          throw new Error(err.error || 'Failed to get upload URL');
        }

        const { signedUrl, token: uploadToken, publicUrl } = await signedRes.json();

        // Step 2: Upload directly to Supabase Storage with progress
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              updateTask(task.id, { progress: pct });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.ontimeout = () => reject(new Error('Upload timed out'));

          // Supabase signed upload URL expects PUT with the token as a header
          xhr.open('PUT', signedUrl);
          xhr.setRequestHeader('Content-Type', fileToUpload.type);
          xhr.setRequestHeader('x-upsert', 'false');
          if (uploadToken) {
            xhr.setRequestHeader('Authorization', `Bearer ${uploadToken}`);
          }
          xhr.timeout = 300000; // 5 minute timeout
          xhr.send(fileToUpload);
        });

        // Generate video thumbnail for preview
        let thumbnailUrl = undefined;
        if (isVideo) {
          try {
            const thumbBlob = await generateVideoThumbnail(task.file);
            thumbnailUrl = URL.createObjectURL(thumbBlob);
          } catch {
            // Thumbnail generation is non-critical
          }
        }

        updateTask(task.id, {
          status: 'complete',
          progress: 100,
          resultUrl: publicUrl,
          thumbnailUrl,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        const newRetry = task.retryCount + 1;

        if (newRetry < MAX_RETRIES) {
          // Retry with exponential backoff
          updateTask(task.id, {
            status: 'pending',
            retryCount: newRetry,
            progress: 0,
          });
          setTimeout(() => {
            queueRef.current.push(task.id);
            processNext();
          }, 1000 * Math.pow(2, newRetry));
        } else {
          updateTask(task.id, { status: 'error', error: message });
        }
      } finally {
        activeCountRef.current--;
        processNext();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, updateTask]
  );

  // Kick off queue processing whenever processNext reference is stable
  const startQueue = useCallback(() => {
    // Process up to MAX_CONCURRENT
    for (let i = 0; i < MAX_CONCURRENT; i++) {
      processNext();
    }
  }, [processNext]);

  const addFiles = useCallback(
    (files: File[]) => {
      const newTasks: UploadTask[] = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'pending' as const,
        progress: 0,
        retryCount: 0,
        isVideo: VIDEO_TYPES.includes(file.type),
      }));

      setTasks((prev) => [...prev, ...newTasks]);
      queueRef.current.push(...newTasks.map((t) => t.id));
      startQueue();

      return newTasks.map((t) => t.id);
    },
    [startQueue]
  );

  const retryFailed = useCallback(() => {
    setTasks((prev) => {
      const failed = prev.filter((t) => t.status === 'error');
      failed.forEach((t) => {
        t.status = 'pending';
        t.retryCount = 0;
        t.progress = 0;
        t.error = undefined;
        queueRef.current.push(t.id);
      });
      return [...prev];
    });
    startQueue();
  }, [startQueue]);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    queueRef.current = queueRef.current.filter((qid) => qid !== id);
  }, []);

  const isUploading = tasks.some(
    (t) => t.status === 'pending' || t.status === 'compressing' || t.status === 'uploading'
  );

  const hasErrors = tasks.some((t) => t.status === 'error');

  const completedUrls = tasks
    .filter((t) => t.status === 'complete' && t.resultUrl)
    .map((t) => t.resultUrl!);

  return {
    tasks,
    addFiles,
    retryFailed,
    removeTask,
    isUploading,
    hasErrors,
    completedUrls,
  };
}
