// Client-side helpers for the public appraisal/consignment photo flow.
//
// Photos go DIRECTLY to Supabase storage via short-lived signed upload URLs,
// then only the storage paths are posted to our API. Routing file bytes
// through the API is not an option: Vercel rejects request bodies over
// ~4.5MB (413 FUNCTION_PAYLOAD_TOO_LARGE), and a single phone photo can
// exceed that on its own.

export const MAX_PHOTOS = 50;
export const MAX_FILE_SIZE = 15 * 1024 * 1024; // keep in sync with the API

import { startVisibleTimer, type PageClock } from './visible-time';

// One implementation, two import paths: the forms have always imported it
// from here.
export { compressImage } from './compress-image';

/** Per-request limit. Generous: a 2MB photo on one bar of LTE can take a minute. */
export const UPLOAD_TIMEOUT_MS = 90_000;
/** Extra attempts after the first, for network errors, timeouts and 5xx. */
export const UPLOAD_RETRIES = 2;
const BACKOFF_MS = 1_000;

export interface UploadOptions {
  timeoutMs?: number;
  retries?: number;
  /** First retry waits this long; each later one three times longer. */
  backoffMs?: number;
  /** Ends the whole upload early: requests in flight are aborted and nothing new starts. */
  signal?: AbortSignal;
}

/** How one request attempt ended, for the retry decision. */
export type AttemptOutcome = { status: number } | 'network' | 'timeout';

/**
 * Worth another attempt? Network drops (a phone locking mid-upload, a dead
 * zone), timeouts and 5xx are transient. A 4xx never is: the signed URL is
 * bad or expired, the file was refused, or we're rate-limited, and repeating
 * it only burns the seller's time.
 */
export function isRetryable(outcome: AttemptOutcome): boolean {
  if (outcome === 'network' || outcome === 'timeout') return true;
  return outcome.status >= 500;
}

export class UploadRequestError extends Error {
  constructor(readonly outcome: 'network' | 'timeout') {
    super(outcome === 'timeout' ? 'Request timed out' : 'Network error');
    this.name = 'UploadRequestError';
  }
}

/**
 * fetch with a per-attempt timeout and bounded retries. Resolves with the
 * final Response (which may be a non-retryable or last-attempt error status);
 * rejects with UploadRequestError when the last attempt never got a response.
 * `init.body` must be re-sendable (a string or Blob, not a stream).
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { timeoutMs = UPLOAD_TIMEOUT_MS, retries = UPLOAD_RETRIES, backoffMs = BACKOFF_MS, signal }: UploadOptions,
  onRetry?: () => void,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new UploadRequestError('timeout');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let outcome: AttemptOutcome;
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.ok || !isRetryable({ status: res.status }) || attempt >= retries) return res;
      outcome = { status: res.status };
      res.body?.cancel().catch(() => {}); // free the connection for the retry
    } catch {
      outcome = controller.signal.aborted ? 'timeout' : 'network';
      if (attempt >= retries || signal?.aborted) throw new UploadRequestError(outcome);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    await pause(backoffMs * 3 ** attempt, signal);
    onRetry?.();
  }
}

/** Wait before a retry; cut short when `signal` aborts. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  const jittered = ms * (0.85 + Math.random() * 0.3);
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, jittered);
    signal?.addEventListener('abort', done, { once: true });
  }).then(() => untilVisible(signal));
}

// A locked phone or backgrounded tab has no network: retrying then just burns
// attempts. Wait until the seller is back on the page (or the upload is called off).
function untilVisible(signal?: AbortSignal): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden' || signal?.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      document.removeEventListener('visibilitychange', onChange);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const onChange = () => {
      if (document.visibilityState !== 'hidden') done();
    };
    document.addEventListener('visibilitychange', onChange);
    signal?.addEventListener('abort', done, { once: true });
  });
}

// A retry after a lost response can find the first attempt already stored.
// Storage answers 409, or 400 with a "Duplicate" body on older versions.
async function isAlreadyStored(res: Response): Promise<boolean> {
  if (res.status === 409) return true;
  if (res.status !== 400) return false;
  const text = await res.text().catch(() => '');
  return /duplicate|already exists/i.test(text);
}

interface SignedUpload {
  index: number;
  path: string;
  signedUrl: string;
}

/**
 * Upload photos straight to storage. Resolves with one entry per input file:
 * its storage path, or null if it didn't make it. `onProgress(done, total)`
 * counts files that have finished for good (uploaded, or failed after its
 * retries), so it never runs ahead of what's actually stored.
 *
 * Throws only when the upload URLs can't be obtained at all.
 */
export async function uploadPhotosDirectEach(
  files: File[],
  onProgress?: (done: number, total: number) => void,
  options: UploadOptions = {},
): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(files.length).fill(null);
  if (files.length === 0) return results;

  let res: Response;
  try {
    res = await fetchWithRetry(
      '/api/appraisal-requests/upload-urls',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map((f) => ({ name: f.name, type: f.type || 'application/octet-stream', size: f.size })),
        }),
      },
      options,
    );
  } catch {
    throw new Error('Could not prepare photo upload');
  }
  if (!res.ok) throw new Error('Could not prepare photo upload');
  const { data } = (await res.json()) as { data: { uploads: SignedUpload[] } };
  const uploads = data.uploads;

  // Files the server declined to sign (type, size) are already final.
  const total = files.length;
  let done = total - uploads.length;
  if (done > 0) onProgress?.(done, total);

  // Small pool: parallel enough to be fast, gentle on mobile radios.
  const POOL = 3;
  let cursor = 0;
  async function worker() {
    while (cursor < uploads.length && !options.signal?.aborted) {
      const u = uploads[cursor++];
      const file = files[u.index];
      let retried = false;
      try {
        const put = await fetchWithRetry(
          u.signedUrl,
          {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          },
          options,
          () => { retried = true; },
        );
        if (put.ok || (retried && (await isAlreadyStored(put)))) results[u.index] = u.path;
      } catch {
        // left null: counted as failed by the caller
      }
      done++;
      onProgress?.(done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, uploads.length) }, worker));
  return results;
}

/**
 * Longest a lead waits on its photos, in time the page is on screen. Each
 * photo may otherwise take three 90-second attempts, three at a time, and a
 * slow connection held the seller's name and number back for many minutes;
 * a closed tab then lost them.
 */
export const PHOTO_PHASE_DEADLINE_MS = 75_000;

export interface DeadlineUploadResult {
  /** One entry per file: its storage path, or null if it didn't make it. */
  results: (string | null)[];
  /** The deadline passed and the stragglers were called off. */
  timedOut: boolean;
}

/**
 * uploadPhotosDirectEach with an overall deadline, counted in visible time
 * (a locked phone uploads nothing, so its time away doesn't count). When it
 * passes, uploads still going are aborted and the ones that made it are
 * returned, so the lead can go without the rest.
 */
export async function uploadPhotosWithDeadline(
  files: File[],
  onProgress?: (done: number, total: number) => void,
  { deadlineMs = PHOTO_PHASE_DEADLINE_MS, clock, ...options }: UploadOptions & { deadlineMs?: number; clock?: PageClock } = {},
): Promise<DeadlineUploadResult> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = startVisibleTimer(
    deadlineMs,
    () => {
      timedOut = true;
      controller.abort();
    },
    clock,
  );
  try {
    const results = await uploadPhotosDirectEach(files, onProgress, { ...options, signal: controller.signal });
    return { results, timedOut };
  } catch (err) {
    // Still waiting for upload URLs when time ran out: nothing was stored.
    if (timedOut) return { results: files.map(() => null), timedOut };
    throw err;
  } finally {
    cancel();
  }
}

/**
 * Upload photos straight to storage. Returns the storage paths of every
 * photo that made it, reporting progress via `onProgress(done, total)`.
 * Tolerates partial failure — a dropped photo shouldn't kill the lead.
 */
export async function uploadPhotosDirect(
  files: File[],
  onProgress?: (done: number, total: number) => void,
  options?: UploadOptions,
): Promise<{ paths: string[]; failed: number }> {
  const results = await uploadPhotosDirectEach(files, onProgress, options);
  const paths = results.filter((p): p is string => p !== null);
  return { paths, failed: files.length - paths.length };
}
