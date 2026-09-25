'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { compressImage } from '@/lib/upload/compress-image';
import { generateVideoThumbnail } from '@/lib/upload/video-thumbnail';
import { generateImageThumbnail } from '@/lib/upload/image-thumbnail';
import { stripVideoLocation } from '@/lib/upload/strip-video-location';
import { stripHeicLocation } from '@/lib/upload/strip-heic-location';
import { checkUploadFile, isVideoType, uploadContentType } from '@/lib/upload/limits';
import {
  COMPRESS_TIMEOUT_MS,
  HEIC_STRIP_TIMEOUT_MS,
  SIGNED_URL_TIMEOUT_MS,
  STALL_TIMEOUT_MS,
  TimeoutError,
  UploadError,
  VIDEO_PREPARE_TIMEOUT_MS,
  canRetry,
  decideRetry,
  failureFromResponse,
  pickNext,
  planPrepareTimeout,
  withVisibleTimeout,
  type UploadFailure,
} from '@/lib/upload/upload-queue';

export interface UploadTask {
  id: string;
  /** The picked file. Absent for uploads restored after a reload. */
  file?: File;
  status: 'pending' | 'compressing' | 'uploading' | 'complete' | 'error';
  progress: number;
  resultUrl?: string;
  /** Small preview (object URL) made from the compressed photo or a video frame. */
  thumbnailUrl?: string;
  failure?: UploadFailure;
  retryCount: number;
  isVideo: boolean;
  /** Video length in seconds, when the browser could read it. */
  duration?: number;
  /** Came back from the saved copy after a reload; only `resultUrl` is known. */
  restored?: boolean;
}

// Why an in-flight task was aborted. Only a stall is an upload failure.
const REMOVED = 'removed';
const STALLED = 'stalled';
const UNMOUNTED = 'unmounted';

/**
 * Make a file ready to upload: a video without its location, a photo
 * downsized (and without its location). The limits count visible time, so a
 * locked phone doesn't use them up. When one runs out, planPrepareTimeout
 * says what happens next; nothing goes up still carrying GPS just because a
 * timer fired.
 */
async function prepareFile(original: File, isVideo: boolean, signal: AbortSignal): Promise<File> {
  const contentType = uploadContentType(original);
  let work = isVideo ? stripVideoLocation(original) : compressImage(original);
  let limit = isVideo ? VIDEO_PREPARE_TIMEOUT_MS : COMPRESS_TIMEOUT_MS;
  for (let attempt = 1; ; attempt++) {
    try {
      return await withVisibleTimeout(work, limit, signal);
    } catch (err) {
      if (signal.aborted || !(err instanceof TimeoutError)) throw err;
      const plan = planPrepareTimeout(contentType, attempt);
      if (plan.action === 'upload-original') return original;
      if (plan.action === 'fail') throw new UploadError(plan.failure);
      // A fresh limit of its own, since the one that ran out says nothing
      // about this step. The slow attempt may still finish first; either
      // result is safe to upload.
      const next = plan.action === 'strip-heic' ? stripHeicLocation(original) : stripVideoLocation(original);
      work = Promise.race([work, next]);
      limit = plan.action === 'strip-heic' ? HEIC_STRIP_TIMEOUT_MS : VIDEO_PREPARE_TIMEOUT_MS;
    }
  }
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function useUploadManager(token: string) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  // Mirror of `tasks` so queue/dispatch logic can read current state without
  // performing side effects inside setTasks updaters (which must stay pure —
  // StrictMode double-invokes them, causing duplicate uploads).
  const tasksRef = useRef<UploadTask[]>([]);
  const queueRef = useRef<string[]>([]);
  // Tasks holding a concurrency slot. A set, released in `finally`, so a
  // slot can never leak the way a hand-kept counter could.
  const activeRef = useRef<Set<string>>(new Set());
  // One AbortController per running task: removing a task (in any state)
  // aborts whatever step it is on, including the storage PUT, so it frees
  // its slot at once and doesn't leave an orphaned object behind.
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const retryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // When each running upload last showed signs of life, for the stall watchdog.
  const lastActivityRef = useRef<Map<string, number>>(new Map());
  const previewStartedRef = useRef<Set<string>>(new Set());

  const commit = useCallback((next: UploadTask[]) => {
    tasksRef.current = next;
    setTasks(next);
  }, []);

  const updateTask = useCallback(
    (id: string, updates: Partial<UploadTask>) => {
      if (!tasksRef.current.some((t) => t.id === id)) return;
      commit(tasksRef.current.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    },
    [commit],
  );

  const findTask = useCallback((id: string) => tasksRef.current.find((t) => t.id === id), []);

  // Previews run beside the upload and never hold it up or fail it.
  const startPreview = useCallback(
    (id: string, source: File, isVideo: boolean) => {
      if (previewStartedRef.current.has(id)) return;
      previewStartedRef.current.add(id);
      const work = isVideo
        ? generateVideoThumbnail(source)
        : generateImageThumbnail(source).then((thumbnail) => ({ thumbnail, duration: null }));
      work.then(({ thumbnail, duration }) => {
        // No frame this time (e.g. the phone was busy or offline): the next
        // attempt at the upload may try again.
        if (!thumbnail) previewStartedRef.current.delete(id);
        const url = thumbnail ? URL.createObjectURL(thumbnail) : undefined;
        if (!findTask(id)) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (url || duration) updateTask(id, { ...(url ? { thumbnailUrl: url } : {}), ...(duration ? { duration } : {}) });
      });
    },
    [findTask, updateTask],
  );

  // `runTask` and `pump` call each other; the ref breaks the cycle.
  const pumpRef = useRef<() => void>(() => {});

  const handleFailure = useCallback(
    (id: string, failure: UploadFailure) => {
      const task = findTask(id);
      if (!task) return;
      const decision = decideRetry(failure, task.retryCount, isOnline());
      if (decision.action === 'retry') {
        updateTask(id, { status: 'pending', retryCount: task.retryCount + 1, progress: 0, failure: undefined });
        const timer = setTimeout(() => {
          retryTimersRef.current.delete(id);
          queueRef.current.push(id);
          pumpRef.current();
        }, decision.delayMs);
        retryTimersRef.current.set(id, timer);
      } else {
        // Offline failures sit here until `online` / the page is shown again.
        updateTask(id, { status: 'error', progress: 0, failure });
      }
    },
    [findTask, updateTask],
  );

  const runTask = useCallback(
    async (id: string) => {
      const controller = new AbortController();
      controllersRef.current.set(id, controller);
      const { signal } = controller;
      try {
        const task = findTask(id);
        if (!task?.file) return;
        const original = task.file;

        // 1. Prepare on the phone: strip video location / downsize photos.
        updateTask(id, { status: 'compressing', progress: 0, failure: undefined });
        if (task.isVideo) startPreview(id, original, true);
        const file = await prepareFile(original, task.isVideo, signal);
        if (!task.isVideo) startPreview(id, file, false);

        // 2. Check it before spending the seller's data on it.
        const check = checkUploadFile(file);
        if (!check.ok) {
          throw new UploadError(
            check.reason === 'too-large'
              ? { kind: 'too-large', bytes: check.bytes, isVideo: check.isVideo }
              : { kind: 'unsupported' },
          );
        }
        const sizeInfo = { bytes: file.size, isVideo: isVideoType(check.contentType) };

        // 3. Signed URL from our API.
        updateTask(id, { status: 'uploading', progress: 0 });
        lastActivityRef.current.set(id, Date.now());
        const res = await withVisibleTimeout(
          fetch(`/api/upload/${token}/signed-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, contentType: check.contentType, fileSize: file.size }),
            signal,
          }),
          SIGNED_URL_TIMEOUT_MS,
          signal,
        );
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          signedUrl?: string;
          token?: string;
          publicUrl?: string;
        };
        if (!res.ok) throw new UploadError(failureFromResponse('signed-url', res.status, body.error, sizeInfo));
        if (!body.signedUrl || !body.publicUrl) throw new UploadError({ kind: 'server' });

        // 4. Straight to storage, with progress.
        await new Promise<void>((resolve, reject) => {
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          const xhr = new XMLHttpRequest();
          const onAbort = () => xhr.abort();
          signal.addEventListener('abort', onAbort, { once: true });
          const settle = (fn: () => void) => {
            signal.removeEventListener('abort', onAbort);
            fn();
          };
          let lastPct = -1;
          xhr.upload.onprogress = (e) => {
            lastActivityRef.current.set(id, Date.now());
            if (!e.lengthComputable) return;
            const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
            if (pct !== lastPct) {
              lastPct = pct;
              updateTask(id, { progress: pct });
            }
          };
          xhr.onreadystatechange = () => lastActivityRef.current.set(id, Date.now());
          xhr.onload = () =>
            settle(() => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
                return;
              }
              let message: string | undefined;
              try {
                message = (JSON.parse(xhr.responseText) as { message?: string }).message;
              } catch {
                // Not JSON; the status is enough.
              }
              reject(new UploadError(failureFromResponse('storage', xhr.status, message, sizeInfo)));
            });
          xhr.onerror = () => settle(() => reject(new UploadError({ kind: 'network' })));
          xhr.ontimeout = () => settle(() => reject(new UploadError({ kind: 'network' })));
          xhr.onabort = () => settle(() => reject(signal.reason ?? new UploadError({ kind: 'network' })));

          // Supabase signed upload URL expects PUT with the token as a header
          xhr.open('PUT', body.signedUrl!);
          xhr.setRequestHeader('Content-Type', check.contentType);
          xhr.setRequestHeader('x-upsert', 'false');
          if (body.token) xhr.setRequestHeader('Authorization', `Bearer ${body.token}`);
          xhr.timeout = 300000; // 5 minute timeout
          xhr.send(file);
        });

        updateTask(id, { status: 'complete', progress: 100, resultUrl: body.publicUrl, failure: undefined });
      } catch (err) {
        if (signal.aborted && signal.reason === REMOVED) return;
        if (signal.aborted && signal.reason === UNMOUNTED) {
          // Only reachable if the page survives (dev Fast Refresh): leave the
          // task retryable rather than stuck at "uploading".
          updateTask(id, { status: 'error', progress: 0, failure: { kind: 'network' } });
          return;
        }
        const failure: UploadFailure =
          err instanceof UploadError
            ? err.failure
            : err instanceof TimeoutError || (signal.aborted && signal.reason === STALLED) || err instanceof TypeError
              ? { kind: 'network' }
              : { kind: 'server' };
        handleFailure(id, failure);
      } finally {
        controllersRef.current.delete(id);
        lastActivityRef.current.delete(id);
        activeRef.current.delete(id);
        pumpRef.current();
      }
    },
    [token, findTask, updateTask, startPreview, handleFailure],
  );

  const pump = useCallback(() => {
    const { start, queue } = pickNext(queueRef.current, tasksRef.current, activeRef.current);
    queueRef.current = queue;
    for (const id of start) {
      activeRef.current.add(id);
      void runTask(id);
    }
  }, [runTask]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const enqueue = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      queueRef.current.push(...ids);
      pump();
    },
    [pump],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const newTasks: UploadTask[] = files.map((file) => {
        const isVideo = isVideoType(uploadContentType(file));
        const task: UploadTask = { id: newId(), file, status: 'pending', progress: 0, retryCount: 0, isVideo };
        // A video can't get smaller on the phone, so an oversized one is
        // turned away now, with the reason, rather than after a queue wait.
        if (isVideo) {
          const check = checkUploadFile(file);
          if (!check.ok) {
            task.status = 'error';
            task.failure =
              check.reason === 'too-large'
                ? { kind: 'too-large', bytes: check.bytes, isVideo: true }
                : { kind: 'unsupported' };
          }
        }
        return task;
      });

      commit([...tasksRef.current, ...newTasks]);
      // Rejected videos still get a frame and a duration, so the seller can
      // see which clip it was and how short to make it.
      newTasks.filter((t) => t.status === 'error').forEach((t) => startPreview(t.id, t.file!, true));
      enqueue(newTasks.filter((t) => t.status === 'pending').map((t) => t.id));

      return newTasks.map((t) => t.id);
    },
    [commit, enqueue, startPreview],
  );

  /** Put failed tasks back in the queue with a fresh set of attempts. */
  const requeue = useCallback(
    (ids: string[]) => {
      const wanted = new Set(ids);
      const retrying = tasksRef.current.filter(
        (t) => wanted.has(t.id) && t.status === 'error' && t.file && canRetry(t.failure),
      );
      if (retrying.length === 0) return;
      const again = new Set(retrying.map((t) => t.id));
      commit(
        tasksRef.current.map((t) =>
          again.has(t.id) ? { ...t, status: 'pending' as const, retryCount: 0, progress: 0, failure: undefined } : t,
        ),
      );
      enqueue([...again]);
    },
    [commit, enqueue],
  );

  const retryTask = useCallback((id: string) => requeue([id]), [requeue]);

  const retryFailed = useCallback(() => {
    requeue(tasksRef.current.filter((t) => t.status === 'error').map((t) => t.id));
  }, [requeue]);

  const removeTask = useCallback(
    (id: string) => {
      controllersRef.current.get(id)?.abort(REMOVED);
      const timer = retryTimersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        retryTimersRef.current.delete(id);
      }
      queueRef.current = queueRef.current.filter((qid) => qid !== id);
      const task = findTask(id);
      if (task?.thumbnailUrl?.startsWith('blob:')) URL.revokeObjectURL(task.thumbnailUrl);
      previewStartedRef.current.delete(id);
      commit(tasksRef.current.filter((t) => t.id !== id));
    },
    [commit, findTask],
  );

  /**
   * Bring back uploads that finished before a reload. Returns the new task
   * ids for each group, in order.
   */
  const restoreCompleted = useCallback(
    (groups: { url: string; video: boolean }[][]) => {
      const idGroups: string[][] = [];
      const restored: UploadTask[] = [];
      for (const group of groups) {
        const ids: string[] = [];
        for (const media of group) {
          const id = newId();
          ids.push(id);
          restored.push({
            id,
            status: 'complete',
            progress: 100,
            resultUrl: media.url,
            retryCount: 0,
            isVideo: media.video,
            restored: true,
          });
        }
        idGroups.push(ids);
      }
      commit([...tasksRef.current, ...restored]);
      return idGroups;
    },
    [commit],
  );

  const cancelAll = useCallback((reason: string) => {
    controllersRef.current.forEach((c) => c.abort(reason));
    retryTimersRef.current.forEach((timer) => clearTimeout(timer));
    retryTimersRef.current.clear();
    queueRef.current = [];
    tasksRef.current.forEach((t) => {
      if (t.thumbnailUrl?.startsWith('blob:')) URL.revokeObjectURL(t.thumbnailUrl);
    });
    previewStartedRef.current.clear();
  }, []);

  /** Forget everything (after a successful send). */
  const reset = useCallback(() => {
    cancelAll(REMOVED);
    commit([]);
  }, [cancelAll, commit]);

  // Back online, or back in view after the phone was locked or the seller
  // switched apps: retry what the connection dropped, and restart uploads
  // that iOS froze mid-flight rather than waiting out their 5-minute timeout.
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== 'visible' || !isOnline()) return;
      // A suspended upload gets a fresh grace period to show progress again.
      const now = Date.now();
      lastActivityRef.current.forEach((_, id) => lastActivityRef.current.set(id, now));
      requeue(
        tasksRef.current.filter((t) => t.status === 'error' && t.failure?.kind === 'network').map((t) => t.id),
      );
    };
    const watchdog = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      lastActivityRef.current.forEach((at, id) => {
        if (now - at > STALL_TIMEOUT_MS) controllersRef.current.get(id)?.abort(STALLED);
      });
    }, 5000);

    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    resume();
    return () => {
      clearInterval(watchdog);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
    };
  }, [requeue]);

  // Tear everything down on unmount: abort in-flight work, clear pending
  // retry timers, and revoke preview object URLs.
  useEffect(() => () => cancelAll(UNMOUNTED), [cancelAll]);

  const isUploading = tasks.some(
    (t) => t.status === 'pending' || t.status === 'compressing' || t.status === 'uploading',
  );

  const hasErrors = tasks.some((t) => t.status === 'error');

  return {
    tasks,
    addFiles,
    retryFailed,
    retryTask,
    removeTask,
    restoreCompleted,
    reset,
    isUploading,
    hasErrors,
  };
}
