'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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
  // Mirror of `tasks` so queue/dispatch logic can read current state without
  // performing side effects inside setTasks updaters (which must stay pure —
  // StrictMode double-invokes them, causing duplicate uploads).
  const tasksRef = useRef<UploadTask[]>([]);
  const activeCountRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  // In-flight XHRs and pending retry timers, keyed by task id, so a removed
  // task can abort its upload (freeing a concurrency slot and not leaving an
  // orphaned Storage object) and everything can be torn down on unmount.
  const xhrRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const retryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const updateTask = useCallback((id: string, updates: Partial<UploadTask>) => {
    tasksRef.current = tasksRef.current.map((t) => (t.id === id ? { ...t, ...updates } : t));
    setTasks(tasksRef.current);
  }, []);

  const processNext = useCallback(() => {
    if (activeCountRef.current >= MAX_CONCURRENT || queueRef.current.length === 0) return;

    const taskId = queueRef.current.shift()!;
    const task = tasksRef.current.find((t) => t.id === taskId);
    if (!task || task.status === 'complete') {
      // Skip stale queue entries and try the next one
      processNext();
      return;
    }

    activeCountRef.current++;
    processTask(task);
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
          xhrRef.current.set(task.id, xhr);

          const done = () => xhrRef.current.delete(task.id);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              updateTask(task.id, { progress: pct });
            }
          };

          xhr.onload = () => {
            done();
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => { done(); reject(new Error('Network error during upload')); };
          xhr.ontimeout = () => { done(); reject(new Error('Upload timed out')); };
          xhr.onabort = () => { done(); reject(new Error('Upload aborted')); };

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
          const timer = setTimeout(() => {
            retryTimersRef.current.delete(task.id);
            queueRef.current.push(task.id);
            processNext();
          }, 1000 * Math.pow(2, newRetry));
          retryTimersRef.current.set(task.id, timer);
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

      tasksRef.current = [...tasksRef.current, ...newTasks];
      setTasks(tasksRef.current);
      queueRef.current.push(...newTasks.map((t) => t.id));
      startQueue();

      return newTasks.map((t) => t.id);
    },
    [startQueue]
  );

  const retryFailed = useCallback(() => {
    const failedIds = tasksRef.current
      .filter((t) => t.status === 'error')
      .map((t) => t.id);
    if (failedIds.length === 0) return;

    tasksRef.current = tasksRef.current.map((t) =>
      t.status === 'error'
        ? { ...t, status: 'pending' as const, retryCount: 0, progress: 0, error: undefined }
        : t
    );
    setTasks(tasksRef.current);
    queueRef.current.push(...failedIds);
    startQueue();
  }, [startQueue]);

  const removeTask = useCallback((id: string) => {
    const task = tasksRef.current.find((t) => t.id === id);
    if (task?.thumbnailUrl) URL.revokeObjectURL(task.thumbnailUrl);
    // Abort an in-flight upload and cancel any pending retry so a removed task
    // stops consuming a slot and doesn't leave an orphaned Storage object.
    const xhr = xhrRef.current.get(id);
    if (xhr) { xhr.abort(); xhrRef.current.delete(id); }
    const timer = retryTimersRef.current.get(id);
    if (timer) { clearTimeout(timer); retryTimersRef.current.delete(id); }
    tasksRef.current = tasksRef.current.filter((t) => t.id !== id);
    setTasks(tasksRef.current);
    queueRef.current = queueRef.current.filter((qid) => qid !== id);
  }, []);

  // Tear everything down on unmount: revoke thumbnail object URLs, abort
  // in-flight uploads, and clear pending retry timers.
  useEffect(() => {
    const xhrs = xhrRef.current;
    const timers = retryTimersRef.current;
    return () => {
      tasksRef.current.forEach((t) => {
        if (t.thumbnailUrl) URL.revokeObjectURL(t.thumbnailUrl);
      });
      xhrs.forEach((xhr) => xhr.abort());
      xhrs.clear();
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
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
